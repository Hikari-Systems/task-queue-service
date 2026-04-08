# task-queue-service-rs

A Rust/actix-web microservice that maintains a queue of background tasks, tracking their lifecycle (pending → started → completed) and a log of each execution attempt. Drop-in replacement for the original TypeScript/Express service; all API endpoints, JSON config keys, and response shapes are identical.

---

## Features

- Task queue with `retriesRemaining` countdown and optimistic locking on `startedAt`
- Task log entries with per-run exit codes and structured output
- Automatic schema migrations on startup (safe against existing Knex-migrated databases)
- Config layering: baked defaults → env vars

---

## API Endpoints

### `GET /healthcheck`
Returns `200 OK` with body `OK`.

```bash
curl http://localhost:3001/healthcheck
```

---

### `GET /api/task/available/:key`
Returns all pending tasks for a given `toBeProcessedBy` key — i.e. `startedAt IS NULL`, `completedAt IS NULL`, and `retriesRemaining > 0`, ordered by `createdAt ASC`. Returns `204 No Content` if none available.

```bash
curl http://localhost:3001/api/task/available/my-worker
```

**Response `200 OK`**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "description": "Process report",
    "toBeProcessedBy": "my-worker",
    "readinessCheckBy": null,
    "runArgs": { "reportId": 42 },
    "startedAt": null,
    "completedAt": null,
    "retriesRemaining": 5,
    "createdAt": "2025-02-21T16:07:00",
    "updatedAt": null
  }
]
```

---

### `GET /api/task/:id`
Returns a single task by UUID. Returns `204 No Content` if not found.

```bash
curl http://localhost:3001/api/task/550e8400-e29b-41d4-a716-446655440000
```

---

### `POST /api/task`
Creates a new task. Auto-generates a UUID.

```bash
curl -X POST http://localhost:3001/api/task \
  -H 'Content-Type: application/json' \
  -d '{
    "description": "Process report",
    "toBeProcessedBy": "my-worker",
    "runArgsJson": "{\"reportId\":42}"
  }'
```

**Body**
| Field | Type | Required | Description |
|---|---|---|---|
| `description` | string | yes | Human-readable description |
| `toBeProcessedBy` | string | yes | Worker key that should pick this up |
| `readinessCheckBy` | string | no | Key of a worker that checks readiness |
| `runArgsJson` | string | yes | JSON-encoded arguments object (pre-stringified) |
| `retriesRemaining` | number | no | Default: `5` |

**Response `201 Created`** — created task object.

---

### `PUT /api/task/:id/started`
Atomically marks a task as started. Only succeeds if `startedAt IS NULL AND completedAt IS NULL` — safe for concurrent workers polling the same queue. Returns `{ id, started: true }` if the lock was acquired, `{ id, started: false }` if another worker got there first.

```bash
curl -X PUT http://localhost:3001/api/task/550e8400-e29b-41d4-a716-446655440000/started
```

**Response `200 OK`**
```json
{ "id": "550e8400-e29b-41d4-a716-446655440000", "started": true }
```

---

### `DELETE /api/task/:id/started`
Clears `startedAt` and `completedAt`, resetting the task to pending so it can be picked up again.

```bash
curl -X DELETE http://localhost:3001/api/task/550e8400-e29b-41d4-a716-446655440000/started
```

**Response `200 OK`**
```json
{ "id": "550e8400-e29b-41d4-a716-446655440000", "started": false }
```

---

### `PUT /api/task/:id/completed`
Marks a task as completed by setting `completedAt = NOW()`.

```bash
curl -X PUT http://localhost:3001/api/task/550e8400-e29b-41d4-a716-446655440000/completed
```

**Response `200 OK`**
```json
{ "id": "550e8400-e29b-41d4-a716-446655440000", "completed": true }
```

---

### `GET /api/taskLog/byTaskId/:taskId`
Returns all log entries for a task, ordered by `createdAt ASC`. Returns `[]` if none.

```bash
curl http://localhost:3001/api/taskLog/byTaskId/550e8400-e29b-41d4-a716-446655440000
```

**Response `200 OK`**
```json
[
  {
    "id": "661f9511-f3ac-52e5-b827-557766551111",
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "exitCode": 0,
    "startedAt": "2025-02-21T16:10:00",
    "endedAt": "2025-02-21T16:10:05",
    "runLog": ["step 1 ok", "step 2 ok"],
    "createdAt": "2025-02-21T16:10:05",
    "updatedAt": null
  }
]
```

---

### `POST /api/taskLog`
Records a new execution attempt for a task. If `exitCode` is non-zero, `retriesRemaining` on the parent task is decremented.

```bash
curl -X POST http://localhost:3001/api/taskLog \
  -H 'Content-Type: application/json' \
  -d '{
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "exitCode": 0,
    "startedAt": "2025-02-21T16:10:00.000Z",
    "endedAt": "2025-02-21T16:10:05.000Z",
    "runLog": "[\"step 1 ok\",\"step 2 ok\"]"
  }'
```

**Body**
| Field | Type | Required | Description |
|---|---|---|---|
| `taskId` | UUID | yes | Parent task ID |
| `exitCode` | number | no | Process exit code; non-zero decrements retries |
| `startedAt` | ISO 8601 string | yes | When the run started |
| `endedAt` | ISO 8601 string | no | When the run ended |
| `runLog` | string | no | JSON-encoded log data (pre-stringified) |

**Response `201 Created`** — created task log object.

---

### `PUT /api/taskLog/:id`
Updates an existing task log entry. If `exitCode` transitions from `null`/`0` to non-zero, `retriesRemaining` on the parent task is decremented.

```bash
curl -X PUT http://localhost:3001/api/taskLog/661f9511-f3ac-52e5-b827-557766551111 \
  -H 'Content-Type: application/json' \
  -d '{
    "exitCode": 1,
    "endedAt": "2025-02-21T16:10:10.000Z",
    "runLog": "[\"step 1 ok\",\"step 2 failed\"]"
  }'
```

**Response `201 Created`** — updated task log object.

---

## End-to-end test sequence

Run with the service listening on `http://localhost:3001` (`docker compose up`).

```bash
BASE=http://localhost:3001

# 1. Healthcheck
curl -s $BASE/healthcheck

# 2. Create a task
TASK=$(curl -s -X POST $BASE/api/task \
  -H 'Content-Type: application/json' \
  -d '{
    "description": "Test task",
    "toBeProcessedBy": "test-worker",
    "runArgsJson": "{\"foo\":42}",
    "retriesRemaining": 3
  }')
echo $TASK | python3 -m json.tool
TASK_ID=$(echo $TASK | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 3. Fetch task by ID
curl -s $BASE/api/task/$TASK_ID | python3 -m json.tool

# 4. Poll available tasks for the worker key (expect 1 result)
curl -s $BASE/api/task/available/test-worker | python3 -m json.tool

# 5. Mark as started (expect started: true)
curl -s -X PUT $BASE/api/task/$TASK_ID/started | python3 -m json.tool

# 6. Try to start again (expect started: false — already locked)
curl -s -X PUT $BASE/api/task/$TASK_ID/started | python3 -m json.tool

# 7. Clear started (reset to pending)
curl -s -X DELETE $BASE/api/task/$TASK_ID/started | python3 -m json.tool

# 8. Mark as started again (expect started: true)
curl -s -X PUT $BASE/api/task/$TASK_ID/started | python3 -m json.tool

# 9. Create a task log (failed run — exit code 1, decrements retries from 3 to 2)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
LOG=$(curl -s -X POST $BASE/api/taskLog \
  -H 'Content-Type: application/json' \
  -d "{
    \"taskId\": \"$TASK_ID\",
    \"exitCode\": 1,
    \"startedAt\": \"$NOW\",
    \"endedAt\": \"$NOW\",
    \"runLog\": \"[\\\"error: something went wrong\\\"]\"
  }")
echo $LOG | python3 -m json.tool
LOG_ID=$(echo $LOG | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 10. Confirm retriesRemaining decremented (expect 2)
curl -s $BASE/api/task/$TASK_ID | python3 -m json.tool

# 11. Update the task log (still failed — no additional decrement)
curl -s -X PUT $BASE/api/taskLog/$LOG_ID \
  -H 'Content-Type: application/json' \
  -d "{\"exitCode\": 1, \"runLog\": \"[\\\"error: something went wrong\\\",\\\"retry scheduled\\\"]\"}" \
  | python3 -m json.tool

# 12. Confirm retriesRemaining still 2 (no double-decrement)
curl -s $BASE/api/task/$TASK_ID | python3 -m json.tool

# 13. Clear started, restart, create a successful log
curl -s -X DELETE $BASE/api/task/$TASK_ID/started
curl -s -X PUT $BASE/api/task/$TASK_ID/started
NOW2=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
curl -s -X POST $BASE/api/taskLog \
  -H 'Content-Type: application/json' \
  -d "{
    \"taskId\": \"$TASK_ID\",
    \"exitCode\": 0,
    \"startedAt\": \"$NOW2\",
    \"endedAt\": \"$NOW2\",
    \"runLog\": \"[\\\"all done\\\"]\"
  }" | python3 -m json.tool

# 14. Mark task completed
curl -s -X PUT $BASE/api/task/$TASK_ID/completed | python3 -m json.tool

# 15. Fetch all logs for the task (expect 2 entries)
curl -s $BASE/api/taskLog/byTaskId/$TASK_ID | python3 -m json.tool

# 16. Available tasks for the worker key should now be empty (expect 204)
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/task/available/test-worker
```

---

## Configuration

Config is loaded from `config.json` (or `CONFIG_PATH` env var), then overridden by environment variables using `__` as the path separator with **exact camelCase key names**.

### `config.json` reference

```json
{
  "server": {
    "port": 3000
  },
  "log": {
    "level": "debug"
  },
  "db": {
    "database": "task-queue-service",
    "host": "task-queue-service-db",
    "port": "5432",
    "username": "task-queue-service",
    "password": "task-queue-service",
    "ssl": {
      "enabled": false,
      "verify": false,
      "caCertFile": ""
    }
  }
}
```

### Environment variable examples

```bash
db__host=postgres
db__password=secret
db__ssl__enabled=true
db__ssl__caCertFile=/certs/ca.pem
log__level=info
server__port=8080
```

---

## Docker / Deployment

### Build and run locally

```bash
docker compose up --build
```

Service listens on `http://localhost:3001` (mapped from container port 3000).

### Multi-stage Dockerfile

1. **`builder`** (`rust:1-bookworm`) — stub `main.rs` compiled first to cache all dependencies as a Docker layer; real source compiled second. No native deps required beyond the Rust toolchain.
2. **`runtime`** (`debian:bookworm-slim`) — binary, migrations, static file, and config only. Runs as unprivileged `nobody`.

Cold build: ~25–35 min. Subsequent builds with dep-cache layer hit: ~2 min.

---

## Development

### Prerequisites

- Rust 1.75+
- PostgreSQL 14+

### Run locally

```bash
# start postgres first, e.g. via docker compose up task-queue-service-db
db__host=localhost ~/.cargo/bin/cargo run
```

### Compile check (no database needed)

```bash
~/.cargo/bin/cargo check
```
