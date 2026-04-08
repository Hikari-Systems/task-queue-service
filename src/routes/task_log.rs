use actix_web::{web, HttpResponse, Responder};
use chrono::{NaiveDateTime, Utc};
use serde::Deserialize;
use uuid::Uuid;

use crate::models::task_log::TaskLog;
use crate::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskLogBody {
    pub task_id: Uuid,
    pub exit_code: Option<i32>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub run_log: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskLogBody {
    pub exit_code: Option<i32>,
    pub ended_at: Option<String>,
    pub run_log: Option<String>,
}

fn parse_timestamp(s: &str) -> Option<NaiveDateTime> {
    // Try ISO 8601 with timezone offset (from Luxon DateTime.toISO())
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.naive_utc());
    }
    // Fallback: plain NaiveDateTime
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f").ok()
}

fn parse_run_log(s: &str) -> Option<serde_json::Value> {
    if s.is_empty() {
        return None;
    }
    serde_json::from_str(s).ok()
}

async fn decrement_retries(task_id: Uuid, db: &sqlx::PgPool) {
    let result = sqlx::query(
        "UPDATE task SET retries_remaining = retries_remaining - 1 \
         WHERE id = $1 AND retries_remaining > 0",
    )
    .bind(task_id)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::error!("Error decrementing retries for task {}: {}", task_id, e);
    }
}

pub async fn get_by_task_id(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let raw_id = path.into_inner();
    let task_id = match Uuid::parse_str(&raw_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().body(format!("Invalid UUID: {}", raw_id)),
    };

    match sqlx::query_as::<_, TaskLog>(
        "SELECT * FROM task_log WHERE task_id = $1 ORDER BY created_at ASC",
    )
    .bind(task_id)
    .fetch_all(&state.db)
    .await
    {
        Err(e) => {
            tracing::error!("Error fetching task logs for task {}: {}", task_id, e);
            HttpResponse::InternalServerError().finish()
        }
        Ok(logs) => HttpResponse::Ok().json(logs),
    }
}

pub async fn create_task_log(
    body: web::Json<CreateTaskLogBody>,
    state: web::Data<AppState>,
) -> impl Responder {
    let started_at = match parse_timestamp(&body.started_at) {
        Some(ts) => ts,
        None => {
            return HttpResponse::BadRequest()
                .body(format!("Invalid startedAt: {}", body.started_at));
        }
    };
    let ended_at = body
        .ended_at
        .as_deref()
        .filter(|s| !s.is_empty())
        .and_then(parse_timestamp);
    let run_log = body
        .run_log
        .as_deref()
        .filter(|s| !s.is_empty())
        .and_then(parse_run_log);

    let id = Uuid::new_v4();
    let now = Utc::now().naive_utc();

    let log = sqlx::query_as::<_, TaskLog>(
        "INSERT INTO task_log (id, task_id, exit_code, started_at, ended_at, run_log, created_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         RETURNING *",
    )
    .bind(id)
    .bind(body.task_id)
    .bind(body.exit_code)
    .bind(started_at)
    .bind(ended_at)
    .bind(run_log.as_ref().map(sqlx::types::Json))
    .bind(now)
    .fetch_one(&state.db)
    .await;

    match log {
        Err(e) => {
            tracing::error!("Error creating task log: {}", e);
            HttpResponse::InternalServerError().finish()
        }
        Ok(log) => {
            if body.exit_code.map(|c| c != 0).unwrap_or(false) {
                decrement_retries(body.task_id, &state.db).await;
            }
            HttpResponse::Created().json(log)
        }
    }
}

pub async fn update_task_log(
    path: web::Path<String>,
    body: web::Json<UpdateTaskLogBody>,
    state: web::Data<AppState>,
) -> impl Responder {
    let raw_id = path.into_inner();
    let id = match Uuid::parse_str(&raw_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().body(format!("Invalid UUID: {}", raw_id)),
    };

    // Fetch the existing log first
    let old_log = match sqlx::query_as::<_, TaskLog>("SELECT * FROM task_log WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
    {
        Err(e) => {
            tracing::error!("Error fetching task log {}: {}", id, e);
            return HttpResponse::InternalServerError().finish();
        }
        Ok(None) => {
            tracing::error!("Updating non-existent task_log row: {}", id);
            return HttpResponse::BadRequest()
                .body(format!("Updating non-existent tasklog row: {}", id));
        }
        Ok(Some(log)) => log,
    };

    let ended_at = body
        .ended_at
        .as_deref()
        .filter(|s| !s.is_empty())
        .and_then(parse_timestamp);
    let run_log = body
        .run_log
        .as_deref()
        .filter(|s| !s.is_empty())
        .and_then(parse_run_log);
    let now = Utc::now().naive_utc();

    let updated = sqlx::query_as::<_, TaskLog>(
        "UPDATE task_log \
         SET exit_code = $1, ended_at = $2, run_log = $3, updated_at = $4 \
         WHERE id = $5 \
         RETURNING *",
    )
    .bind(body.exit_code)
    .bind(ended_at)
    .bind(run_log.as_ref().map(sqlx::types::Json))
    .bind(now)
    .bind(id)
    .fetch_one(&state.db)
    .await;

    match updated {
        Err(e) => {
            tracing::error!("Error updating task log {}: {}", id, e);
            HttpResponse::InternalServerError().finish()
        }
        Ok(log) => {
            // Decrement retries if exit_code transitions from 0/null to non-zero
            let old_failed = old_log.exit_code.map(|c| c != 0).unwrap_or(false);
            let new_failed = body.exit_code.map(|c| c != 0).unwrap_or(false);
            if new_failed && !old_failed {
                decrement_retries(old_log.task_id, &state.db).await;
            }
            HttpResponse::Created().json(log)
        }
    }
}
