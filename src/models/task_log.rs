use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TaskLog {
    pub id: Uuid,
    pub task_id: Uuid,
    pub exit_code: Option<i32>,
    pub started_at: NaiveDateTime,
    pub ended_at: Option<NaiveDateTime>,
    #[sqlx(json)]
    pub run_log: Option<serde_json::Value>,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}
