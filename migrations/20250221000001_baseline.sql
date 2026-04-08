-- Consolidated baseline migration (safe on existing Knex-migrated DBs: all IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS task (
    id UUID PRIMARY KEY NOT NULL,
    description VARCHAR(400) NOT NULL,
    to_be_processed_by VARCHAR(400) NOT NULL,
    readiness_check_by VARCHAR(400),
    run_args JSONB NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    retries_remaining INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

ALTER TABLE task ADD COLUMN IF NOT EXISTS retries_remaining INTEGER NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS task_log (
    id UUID PRIMARY KEY NOT NULL,
    task_id UUID NOT NULL REFERENCES task(id),
    exit_code INTEGER,
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    run_log JSONB,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
