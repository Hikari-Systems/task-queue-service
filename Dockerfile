# Stage 1: build dependencies (cached layer)
FROM rust:1-bookworm AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs
RUN cargo build --release
RUN rm -f target/release/deps/task_queue_service*

# Build the real binary
COPY src ./src
COPY migrations ./migrations
COPY static ./static
RUN cargo build --release --locked

# Stage 2: runtime
FROM debian:bookworm-slim

WORKDIR /app

COPY --from=builder /app/target/release/task-queue-service /app/task-queue-service
COPY --from=builder /app/migrations /app/migrations
COPY --from=builder /app/static /app/static
COPY config.json /app/config.json

USER nobody

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD ["/app/task-queue-service", "healthcheck"]

CMD ["/app/task-queue-service"]
