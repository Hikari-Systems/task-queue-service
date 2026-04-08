use actix_web::{web, HttpResponse, Responder};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::task::Task;
use crate::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskBody {
    pub description: String,
    pub to_be_processed_by: String,
    pub readiness_check_by: Option<String>,
    pub run_args_json: String,
    pub retries_remaining: Option<i32>,
}

#[derive(Serialize)]
pub struct StartedResponse {
    pub id: Uuid,
    pub started: bool,
}

#[derive(Serialize)]
pub struct CompletedResponse {
    pub id: Uuid,
    pub completed: bool,
}

pub async fn get_available(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let key = path.into_inner();
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT * FROM task \
         WHERE started_at IS NULL AND completed_at IS NULL \
         AND to_be_processed_by = $1 AND retries_remaining > 0 \
         ORDER BY created_at ASC",
    )
    .bind(&key)
    .fetch_all(&state.db)
    .await;

    match tasks {
        Err(e) => {
            tracing::error!("Error fetching available tasks for {}: {}", key, e);
            HttpResponse::InternalServerError().finish()
        }
        Ok(tasks) if tasks.is_empty() => {
            tracing::debug!("no available tasks found for {}", key);
            HttpResponse::NoContent().finish()
        }
        Ok(tasks) => {
            tracing::debug!("{} available tasks found for {}", tasks.len(), key);
            HttpResponse::Ok().json(tasks)
        }
    }
}

pub async fn get_task(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let raw_id = path.into_inner();
    let id = match Uuid::parse_str(&raw_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().body(format!("Invalid UUID: {}", raw_id)),
    };

    match sqlx::query_as::<_, Task>("SELECT * FROM task WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
    {
        Err(e) => {
            tracing::error!("Error fetching task {}: {}", id, e);
            HttpResponse::InternalServerError().finish()
        }
        Ok(None) => {
            tracing::debug!("no task found for id {}", id);
            HttpResponse::NoContent().finish()
        }
        Ok(Some(task)) => HttpResponse::Ok().json(task),
    }
}

pub async fn create_task(
    body: web::Json<CreateTaskBody>,
    state: web::Data<AppState>,
) -> impl Responder {
    let run_args = match serde_json::from_str::<serde_json::Value>(&body.run_args_json) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("Invalid JSON for runArgsJson: {} — {}", body.run_args_json, e);
            return HttpResponse::BadRequest()
                .body(format!("Invalid JSON for runArgsJson: {}", body.run_args_json));
        }
    };

    let id = Uuid::new_v4();
    let retries = body.retries_remaining.unwrap_or(5);
    let now = Utc::now().naive_utc();

    let task = sqlx::query_as::<_, Task>(
        "INSERT INTO task \
         (id, description, to_be_processed_by, readiness_check_by, run_args, retries_remaining, created_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         RETURNING *",
    )
    .bind(id)
    .bind(&body.description)
    .bind(&body.to_be_processed_by)
    .bind(&body.readiness_check_by)
    .bind(sqlx::types::Json(&run_args))
    .bind(retries)
    .bind(now)
    .fetch_one(&state.db)
    .await;

    match task {
        Err(e) => {
            tracing::error!("Error creating task: {}", e);
            HttpResponse::InternalServerError().finish()
        }
        Ok(task) => HttpResponse::Created().json(task),
    }
}

pub async fn mark_started(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let raw_id = path.into_inner();
    let id = match Uuid::parse_str(&raw_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().body(format!("Invalid UUID: {}", raw_id)),
    };

    let result = sqlx::query_as::<_, Task>(
        "UPDATE task SET started_at = NOW(), completed_at = NULL \
         WHERE id = $1 AND started_at IS NULL AND completed_at IS NULL \
         RETURNING *",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match result {
        Err(e) => {
            tracing::error!("Error marking task {} started: {}", id, e);
            HttpResponse::InternalServerError().finish()
        }
        Ok(row) => HttpResponse::Ok().json(StartedResponse {
            id,
            started: row.is_some(),
        }),
    }
}

pub async fn clear_started(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let raw_id = path.into_inner();
    let id = match Uuid::parse_str(&raw_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().body(format!("Invalid UUID: {}", raw_id)),
    };

    let result = sqlx::query(
        "UPDATE task SET started_at = NULL, completed_at = NULL WHERE id = $1",
    )
    .bind(id)
    .execute(&state.db)
    .await;

    match result {
        Err(e) => {
            tracing::error!("Error clearing started for task {}: {}", id, e);
            HttpResponse::InternalServerError().finish()
        }
        Ok(_) => HttpResponse::Ok().json(StartedResponse { id, started: false }),
    }
}

pub async fn mark_completed(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let raw_id = path.into_inner();
    let id = match Uuid::parse_str(&raw_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().body(format!("Invalid UUID: {}", raw_id)),
    };

    let result = sqlx::query("UPDATE task SET completed_at = NOW() WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await;

    match result {
        Err(e) => {
            tracing::error!("Error marking task {} completed: {}", id, e);
            HttpResponse::InternalServerError().finish()
        }
        Ok(_) => HttpResponse::Ok().json(CompletedResponse { id, completed: true }),
    }
}
