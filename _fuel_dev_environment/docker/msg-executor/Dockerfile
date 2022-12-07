# Based off of: https://hub.docker.com/_/rust
FROM rust:1.64 as builder
WORKDIR /usr/src/msg_executor
COPY ./docker/msg-executor/bridge-message-executor .
RUN cargo install --path .

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/local/cargo/bin/bridge-message-executor /usr/local/bin/bridge-message-executor
COPY ./scripts/msg_executor.sh .
COPY ./docker/msg-executor/bridge-message-executor/bridge-message-predicates ./bridge-message-predicates
CMD ["sh", "./msg_executor.sh"]
