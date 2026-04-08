# CLAUDE.md — task-queue-service-rs

Guidance for AI assistants working on this codebase.

---

## What this service does

Maintains a queue of background tasks with lifecycle tracking (pending → started → completed) and a per-run execution log. No S3, no file I/O, no external services beyond PostgreSQL. This is a Rust/actix-web rewrite of the original TypeScript/Express/Knex service and must remain a drop-in replacement.

---

## Codebase map

```
src/
  main.rs            — startup: config load, pool build, migrations, server bind; healthcheck subcommand
  config.rs          — AppConfig and sub-structs; serde_json loader + env var override walker
  models/
    task.rs          — Task struct (FromRow + Serialize)
    task_log.rs      — TaskLog struct (FromRow + Serialize)
  routes/
    task.rs          — task CRUD and lifecycle endpoints
    task_log.rs      — task log insert/update
static/
  index.html         — root page (embedded via include_str! at compile time)
migrations/
  20250221000001_baseline.sql — single consolidated migration, IF NOT EXISTS throughout
config.json          — default config values baked into the image
```

---

## Critical implementation decisions

### Config loading (`config.rs`)
**Do not use the `config` crate.** It normalises JSON keys to lowercase, breaking `camelCase` fields like `caCertFile`. The custom loader reads `config.json` with `serde_json::Value`, applies env var overrides by recursively walking the tree with exact-case segment matching, then deserialises in one pass.

Config priority (lowest → highest):
1. `config.json` in the working directory (or `CONFIG_PATH` env var)
2. Env vars with `__` separator, exact camelCase path segments (e.g. `db__host=postgres`)

### Route registration (`main.rs`)
Routes are registered directly on the `web::scope` — never inside `web::scope("")`. An empty scope matches all paths and swallows 404s.

Route order matters: `/api/task/available/{key}` **must be registered before** `/api/task/{id}`, otherwise the literal segment `available` is consumed as a UUID (and fails to parse), returning 400 instead of the task list.

### AppState (`main.rs`)
`AppState` is a **concrete struct** with a `PgPool` field. All handlers take `state: web::Data<AppState>`.

### sqlx queries (`routes/`)
Use **runtime queries** (`query_as::<_, Row>(sql).bind(value)`) not compile-time macros (`query_as!`). The macro requires `DATABASE_URL` at compile time, which breaks Docker builds without a live database.

### JSONB fields — run_args and run_log
Both columns are `JSONB`. Struct fields use `#[sqlx(json)]` for `FromRow` decoding and `sqlx::types::Json(&value)` for INSERT/UPDATE binds. The field type is `serde_json::Value` (or `Option<serde_json::Value>`), keeping serialisation clean.

`runArgsJson` and `runLog` arrive in request bodies as **pre-stringified JSON strings** (matching the original TS client contract). Handlers parse them with `serde_json::from_str` before storing.

### Timestamps — NaiveDateTime, not DateTime<Utc>
The original Knex migrations used `t.timestamp()` which creates `TIMESTAMP WITHOUT TIME ZONE` PostgreSQL columns. sqlx maps `TIMESTAMP` → `chrono::NaiveDateTime` and `TIMESTAMPTZ` → `chrono::DateTime<Utc>` — they are not interchangeable at the wire level (different OIDs). All timestamp fields use `NaiveDateTime` (or `Option<NaiveDateTime>`).

ISO 8601 timestamps from clients (e.g. `"2025-02-21T16:10:00.000Z"`) are parsed via `chrono::DateTime::parse_from_rfc3339` and converted to `NaiveDateTime` via `.naive_utc()`.

### Optimistic start lock (`routes/task.rs` — `mark_started`)
`PUT /api/task/:id/started` uses `WHERE started_at IS NULL AND completed_at IS NULL` with `RETURNING *`. The update is atomic — if two workers race, only one gets rows back. `started: true` means the lock was acquired; `started: false` means another worker beat this one.

### retriesRemaining decrement logic
`POST /api/taskLog` — decrement if `exit_code != 0`.
`PUT /api/taskLog/:id` — decrement only if exit_code **transitions** from `null`/`0` to non-zero (prevents double-decrement on re-update of an already-failed log).

### Baseline migration (`migrations/20250221000001_baseline.sql`)
A single migration creates both tables in their final state using `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`. Safe to run against a database already migrated by the TypeScript/Knex service — all statements are no-ops, the migration is recorded in `_sqlx_migrations`, and the service starts normally.

### healthcheck subcommand (`main.rs`)
Before the async runtime starts, `main` checks for the `healthcheck` argv. If present, it opens a raw TCP connection to `localhost:<port>`, sends `GET /healthcheck HTTP/1.1`, reads the response, and exits 0/1. No extra dependencies. Used by the Dockerfile `HEALTHCHECK` directive and `docker-compose.yml` app healthcheck.

### Static file serving
`static/index.html` is embedded via `include_str!("../static/index.html")` and served from `GET /`. Do not use `actix-files` — relative paths are unreliable inside Docker.

### TLS / OpenSSL
sqlx is configured with `runtime-tokio-rustls`. This eliminates `openssl`/`pkg-config` from the build. The runtime image needs only `libc`, `libm`, `libgcc_s`.

---

## Docker build notes

Two-stage build:
1. **`builder`** (`rust:1-bookworm`) — stub `src/main.rs` (`fn main() {}`) compiled first to cache dependency compilation. Stub artifacts deleted, real source overlaid, then `cargo build --release --locked`.
2. **`runtime`** (`debian:bookworm-slim`) — binary, migrations, static, config.json. Runs as `nobody`.

Do not use alpine/musl. Do not use cargo-chef (no benefit for a single-crate service).

---

## Adding new endpoints

1. Add the SQL query in the relevant `routes/` handler file (or a new one).
2. Register the route in `main.rs` — place specific/static path segments before wildcard parameters.

---

## Common gotchas

- Config key names are **case-sensitive**. `db__host` not `db__Host`.
- `runArgsJson` and `runLog` in request bodies are JSON strings, not JSON objects — clients must pre-stringify them.
- `_sqlx_migrations` (sqlx) and `knex_migrations` (Knex) coexist without conflict.
- `retriesRemaining` is set to 5 by default on insert; only decremented on non-zero exit codes, never on successful runs.
- Timestamp serialisation format is `"2025-02-21T16:10:00"` (NaiveDateTime, no Z suffix) — minor behavioural difference from the TS service's `"2025-02-21T16:10:00.000Z"` due to the schema using `TIMESTAMP` (no timezone).
