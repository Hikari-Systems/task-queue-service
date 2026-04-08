use actix_web::{web, App, HttpResponse, HttpServer};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use tracing_subscriber::EnvFilter;

mod config;
mod models;
mod routes;

pub struct AppState {
    pub db: sqlx::PgPool,
}

fn run_healthcheck(host: &str, port: u16) -> bool {
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::time::Duration;
    let Ok(mut stream) = TcpStream::connect(format!("{host}:{port}")) else {
        return false;
    };
    stream.set_read_timeout(Some(Duration::from_secs(4))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(4))).ok();
    let req = "GET /healthcheck HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    response.starts_with("HTTP/1.1 200")
}

fn load_port_for_healthcheck() -> u16 {
    std::fs::read_to_string("config.json")
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v["server"]["port"].as_u64())
        .map(|p| p as u16)
        .unwrap_or(3000)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() == Some("healthcheck") {
        let host = args.next().unwrap_or_else(|| "localhost".to_string());
        let port = args
            .next()
            .and_then(|s| s.parse::<u16>().ok())
            .unwrap_or_else(load_port_for_healthcheck);
        std::process::exit(if run_healthcheck(&host, port) { 0 } else { 1 });
    }

    let cfg = config::load();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_new(&cfg.log.level).unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let ssl_mode = if cfg.db.ssl.enabled {
        if cfg.db.ssl.verify {
            PgSslMode::VerifyCa
        } else {
            PgSslMode::Require
        }
    } else {
        PgSslMode::Disable
    };

    let db_port: u16 = cfg.db.port.parse().unwrap_or(5432);
    let mut connect_opts = PgConnectOptions::new()
        .host(&cfg.db.host)
        .port(db_port)
        .database(&cfg.db.database)
        .username(&cfg.db.username)
        .password(&cfg.db.password)
        .ssl_mode(ssl_mode);

    if cfg.db.ssl.enabled && !cfg.db.ssl.ca_cert_file.is_empty() {
        connect_opts = connect_opts.ssl_root_cert(&cfg.db.ssl.ca_cert_file);
    }

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect_with(connect_opts)
        .await
        .expect("Failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    tracing::info!("Migrations complete");

    let port = cfg.server.port;

    tracing::info!("task-queue-service listening on port {port}");

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState { db: pool.clone() }))
            .route("/healthcheck", web::get().to(healthcheck))
            .route("/", web::get().to(index))
            .service(
                web::scope("/api")
                    .service(
                        web::scope("/task")
                            // /available/:key must be before /:id
                            .route(
                                "/available/{key}",
                                web::get().to(routes::task::get_available),
                            )
                            .route("/{id}", web::get().to(routes::task::get_task))
                            .route("", web::post().to(routes::task::create_task))
                            .route(
                                "/{id}/started",
                                web::put().to(routes::task::mark_started),
                            )
                            .route(
                                "/{id}/started",
                                web::delete().to(routes::task::clear_started),
                            )
                            .route(
                                "/{id}/completed",
                                web::put().to(routes::task::mark_completed),
                            ),
                    )
                    .service(
                        web::scope("/taskLog")
                            .route(
                                "/byTaskId/{taskId}",
                                web::get().to(routes::task_log::get_by_task_id),
                            )
                            .route("", web::post().to(routes::task_log::create_task_log))
                            .route(
                                "/{id}",
                                web::put().to(routes::task_log::update_task_log),
                            ),
                    ),
            )
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}

async fn healthcheck() -> HttpResponse {
    HttpResponse::Ok().body("OK")
}

async fn index() -> HttpResponse {
    static HTML: &str = include_str!("../static/index.html");
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(HTML)
}
