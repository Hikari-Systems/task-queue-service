use actix_web::{web, App, HttpResponse};
use anyhow::Result;

use hs_utils::db::build_pool;

mod config;
mod models;
mod routes;

pub struct AppState {
    pub db: sqlx::PgPool,
}

#[actix_web::main]
async fn main() -> Result<()> {
    hs_utils::healthcheck::check_subcommand(
        config::load().map(|c| c.server.port).unwrap_or(3000),
    );

    let cfg = config::load()?;

    hs_utils::logging::init(&cfg.log.level);

    let pool = build_pool(&cfg.db).await?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await?;
    tracing::info!("Migrations complete");

    let port = cfg.server.port;

    hs_utils::server::run(port, move || {
        App::new()
            .app_data(web::Data::new(AppState { db: pool.clone() }))
            .route("/healthcheck", web::get().to(|| async { HttpResponse::Ok().body("OK") }))
            .route("/", web::get().to(index))
            .service(
                web::scope("/api")
                    .service(
                        web::scope("/task")
                            // /available/:key must be before /:id
                            .route("/available/{key}", web::get().to(routes::task::get_available))
                            .route("/{id}", web::get().to(routes::task::get_task))
                            .route("", web::post().to(routes::task::create_task))
                            .route("/{id}/started", web::put().to(routes::task::mark_started))
                            .route("/{id}/started", web::delete().to(routes::task::clear_started))
                            .route("/{id}/completed", web::put().to(routes::task::mark_completed)),
                    )
                    .service(
                        web::scope("/taskLog")
                            .route("/byTaskId/{taskId}", web::get().to(routes::task_log::get_by_task_id))
                            .route("", web::post().to(routes::task_log::create_task_log))
                            .route("/{id}", web::put().to(routes::task_log::update_task_log)),
                    ),
            )
    })
    .await
}

async fn index() -> HttpResponse {
    static HTML: &str = include_str!("../static/index.html");
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(HTML)
}
