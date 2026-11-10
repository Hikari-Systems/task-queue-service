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

---

## Instrumented calls (hs-utils otel)

Traces and metrics come from hs-utils' `otel` module, v0.37.1 and later. This repo is on v0.35.0, so until it
bumps, read this section as the target. All of it is inert until `otel.enabled` is set, so it can land before
a Collector or Honeycomb key exists. The full reference is hs-utils' `CLAUDE.md` (v0.37.0).

**Startup.**
- `let _otel = hs_utils::otel::init(&log_level, &cfg.otel)?;` replaces `logging::init`, with the same level
  string. Call it inside the runtime and hold `_otel` for the whole of `main`; dropping it flushes the
  exporters.
- Add `#[serde(default)] pub otel: hs_utils::otel::OtelConfig` to the config, and ship
  `"otel": { "enabled": "false", "serviceName": "task-queue-service" }` in `config.json`.
- `.wrap(hs_utils::otel::actix_trace())` on the `App`, in place of `.wrap(hs_utils::middleware::timing())`
  (feature `otel-actix`). It names spans by route template and adopts the caller's `traceparent`.
- **A path segment that is a credential** (`/hooks/{token}`, a magic-link token): install a redactor before
  serving, `hs_utils::otel::set_path_redactor(redact_fn)`. The layer records the concrete `url.path` otherwise.
  Replacing a hand-rolled `TraceLayer` that redacted paths means moving its redaction here.

**Outbound HTTP: `.send_traced()`, never `.send()`.**
```rust
use hs_utils::http_client::SendTraced as _;
let resp = state.http.get(&url).header("X-Api-Key", &key).send_traced().await?;
```
- It records the call as a client span with status and duration, with query values redacted.
- With `otel`, it sends `traceparent`, so the service on the other end continues this trace. A bare `.send()` is
  a call no trace can see, and starts an unconnected trace on the far side.
- **A URL that is its own credential** uses `.send_traced_opaque()`, which records only `scheme://host:port`.
  That covers Slack and Discord webhooks, a user-supplied target, and an MCP server URL with a key in it.
- Needs the hs-utils feature `http-client`.
- Once every call is converted, add a `clippy.toml` so new code can't drop out of the trace:
```toml
disallowed-methods = [
    { path = "reqwest::RequestBuilder::send", reason = "use .send_traced() (hs_utils::http_client::SendTraced) so the call is traced and carries traceparent" },
]
```

**Queries.**
- sqlx already logs each statement (target `sqlx::query`, SQL text without bind values).
- For a span per repository call, use `#[tracing::instrument(skip_all, name = "db.<operation>",
  fields(db.system.name = "postgresql"))]`.
- `db.slowqueryms` sets the slow-statement warning (default 1000).

**Name operations, never data.**
- Span names, `client_span`'s system and operation, and metric labels are constants from code.
- No ids, emails, keys, tokens or SQL literals: spans go to a third-party store, and every distinct value is a
  new series there.
- If you need a value, record it as a field in the handler, where a reviewer can see it.

**Metrics need no extra code.** `otel::init` and the layers above report:
- request durations and in-flight requests, by route;
- outbound latency, by host;
- DB pool use;
- process and container CPU, memory, I/O and pressure stall (the container's iowait).

Set `otel__metricsEnabled: "false"` to keep traces only.
