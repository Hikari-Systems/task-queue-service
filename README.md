# Task Queue Service

A lightweight, RESTful task queue service built with Node.js, Express, and PostgreSQL. This service maintains a list of tasks that need to be carried out as background items, providing a simple API for task management, tracking, and logging.

## Features

- **Task Management**: Create, retrieve, and manage background tasks
- **Task Status Tracking**: Track task lifecycle (pending, started, completed)
- **Task Filtering**: Query available tasks by processor key
- **Task Logging**: Record execution logs with exit codes and runtime information
- **RESTful API**: Clean HTTP API for all operations
- **PostgreSQL Backend**: Robust database storage with automatic migrations
- **Docker Support**: Containerized deployment with Docker Compose
- **TypeScript**: Fully typed codebase for better maintainability

## Requirements

- Node.js 22 or higher
- PostgreSQL 12 or higher
- npm or yarn

## Installation

### Using npm

```bash
npm install
```

### Using Docker

The project includes Docker Compose configuration for easy deployment:

```bash
docker-compose up
```

This will start both the application and PostgreSQL database containers.

## Configuration

The service uses a `config.json` file for configuration. You can also override settings using environment variables (using double underscores as separators, e.g., `db__host`).

### Configuration Options

- `server.port` - HTTP server port (default: 3000)
- `log.level` - Logging level (default: debug)
- `db.host` - PostgreSQL host
- `db.port` - PostgreSQL port (default: 5432)
- `db.database` - Database name
- `db.username` - Database username
- `db.password` - Database password
- `db.ssl.enabled` - Enable SSL connections (default: false)
- `db.ssl.verify` - Verify SSL certificates (default: false)
- `db.ssl.caCertFile` - Path to CA certificate file
- `db.minpool` - Minimum connection pool size (default: 0)
- `db.maxpool` - Maximum connection pool size (default: 10)
- `db.debug` - Enable Knex query debugging (default: false)

### Example Configuration

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
    "host": "localhost",
    "port": "5432",
    "username": "task-queue-service",
    "password": "task-queue-service"
  }
}
```

## Usage

### Starting the Service

```bash
npm start
```

The service will automatically run database migrations on startup and listen on the configured port (default: 3000).

### API Endpoints

#### Health Check

```
GET /healthcheck
```

Returns `200 OK` if the service is running.

#### Task Endpoints

##### Create a Task

```
POST /api/task
Content-Type: application/json

{
  "description": "Process user data",
  "toBeProcessedBy": "worker-1",
  "readinessCheckBy": "scheduler",
  "runArgsJson": "{\"userId\": 123, \"action\": \"export\"}"
}
```

Creates a new task and returns the created task object with a generated UUID.

##### Get Available Tasks

```
GET /api/task/available/:key
```

Returns all available (not started and not completed) tasks for the specified processor key. Returns `204 No Content` if no tasks are available.

Example: `GET /api/task/available/worker-1`

##### Get Task by ID

```
GET /api/task/:id
```

Returns a specific task by its UUID. Returns `204 No Content` if the task doesn't exist.

##### Mark Task as Started

```
PUT /api/task/:id/started
Content-Type: application/json
```

Marks a task as started. Only works if the task hasn't been started or completed yet. Returns `{ "id": "...", "started": true }` if successful, or `{ "id": "...", "started": false }` if the task was already started or completed.

##### Clear Task Started Status

```
DELETE /api/task/:id/started
Content-Type: application/json
```

Clears the started status of a task, resetting it to pending state.

##### Mark Task as Completed

```
PUT /api/task/:id/completed
Content-Type: application/json
```

Marks a task as completed. Returns `{ "id": "...", "completed": true }`.

#### Task Log Endpoints

##### Create Task Log

```
POST /api/taskLog
Content-Type: application/json

{
  "taskId": "uuid-of-task",
  "exitCode": 0,
  "startedAt": "2025-02-21T16:00:00Z",
  "endedAt": "2025-02-21T16:05:00Z",
  "runLog": "{\"output\": \"Task completed successfully\"}"
}
```

Creates a new log entry for a task execution.

##### Get Task Logs by Task ID

```
GET /api/taskLog/byTaskId/:taskId
```

Returns all log entries for a specific task, ordered by creation time.

##### Update Task Log

```
PUT /api/taskLog/:id
Content-Type: application/json

{
  "exitCode": 0,
  "endedAt": "2025-02-21T16:05:00Z",
  "runLog": "{\"output\": \"Task completed successfully\"}"
}
```

Updates an existing task log entry.

### Task Lifecycle

1. **Create**: A task is created via `POST /api/task`
2. **Available**: The task appears in `GET /api/task/available/:key` queries
3. **Started**: A worker marks the task as started via `PUT /api/task/:id/started`
4. **Completed**: After processing, the task is marked as completed via `PUT /api/task/:id/completed`
5. **Logging**: Task execution details are recorded via the task log endpoints

### Example Workflow

```bash
# 1. Create a task
curl -X POST http://localhost:3000/api/task \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Export user data",
    "toBeProcessedBy": "export-worker",
    "runArgsJson": "{\"userId\": 123}"
  }'

# 2. Get available tasks for a worker
curl http://localhost:3000/api/task/available/export-worker

# 3. Mark task as started (using task ID from step 1)
curl -X PUT http://localhost:3000/api/task/{task-id}/started \
  -H "Content-Type: application/json"

# 4. Create a log entry
curl -X POST http://localhost:3000/api/taskLog \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "{task-id}",
    "exitCode": 0,
    "startedAt": "2025-02-21T16:00:00Z",
    "endedAt": "2025-02-21T16:05:00Z"
  }'

# 5. Mark task as completed
curl -X PUT http://localhost:3000/api/task/{task-id}/completed \
  -H "Content-Type: application/json"
```

## Development

### Prerequisites

- Node.js 22+
- PostgreSQL 12+
- npm or yarn

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up your database and configure `config.json`
4. Run migrations automatically on startup, or manually if needed

### Scripts

- `npm test` - Run tests
- `npm testci` - Run tests in CI mode (with bail)
- `npm lint` - Lint the codebase
- `npm build` - Build TypeScript to JavaScript (outputs to `es5/`)
- `npm build:esbuild` - Build optimized bundle using esbuild (outputs to `dist/`)
- `npm watch` - Watch mode for TypeScript compilation
- `npm start` - Start the server (requires built code in `es5/`)

### Project Structure

```
task-queue-service/
├── lib/                    # Source code
│   ├── model/             # Data models (task, taskLog)
│   ├── route/             # Express route handlers
│   ├── index.ts           # Main router
│   ├── server.ts          # Server entry point
│   └── knexfile.ts        # Database configuration
├── migrations/            # Database migrations
├── static/               # Static files (HTML, etc.)
├── __tests__/            # Test files
├── config.json           # Configuration file
├── docker-compose.yml     # Docker Compose configuration
├── Dockerfile            # Docker build configuration
└── package.json          # npm package configuration
```

### Database Schema

The service uses two main tables:

- **task**: Stores task definitions and status
  - `id` (UUID, primary key)
  - `description` (string)
  - `toBeProcessedBy` (string) - Key identifying which processor should handle this task
  - `readinessCheckBy` (string, optional) - Key for readiness checking
  - `runArgs` (JSONB) - Task execution arguments
  - `startedAt` (timestamp, nullable)
  - `completedAt` (timestamp, nullable)
  - `createdAt`, `updatedAt` (timestamps)

- **taskLog**: Stores execution logs for tasks
  - `id` (UUID, primary key)
  - `taskId` (UUID, foreign key to task)
  - `exitCode` (integer, nullable)
  - `startedAt` (timestamp)
  - `endedAt` (timestamp, nullable)
  - `runLog` (JSONB, nullable) - Execution log data
  - `createdAt`, `updatedAt` (timestamps)

## Docker Deployment

The project includes Docker support for containerized deployment.

### Building the Docker Image

```bash
docker build -t task-queue-service .
```

### Using Docker Compose

```bash
docker-compose up -d
```

This will:
- Start a PostgreSQL database container
- Build and start the application container
- Set up networking between containers
- Run database migrations automatically

The service will be available at `http://localhost:3001` (mapped from container port 3000).

### Environment Variables

You can override database configuration using environment variables:

```bash
db__host=localhost
db__username=myuser
db__password=mypassword
db__database=mydb
```

## License

Copyright 2025 Rick Knowles <rick.knowles@hikari-systems.com>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
