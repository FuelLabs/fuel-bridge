# Stage 1: Use cargo-chef to generate a recipe
FROM lukemathwalker/cargo-chef:latest-rust-slim AS chef

RUN apt-get update && \
    apt-get install -y libssl-dev pkg-config && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

FROM chef AS watchtower_builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY packages/message-predicates/contract-message-predicate/Cargo.toml packages/message-predicates/contract-message-predicate/
COPY packages/fungible-token/bridge-fungible-token/Cargo.toml packages/fungible-token/bridge-fungible-token/
COPY packages/fuel-canary-watchtower/ packages/fuel-canary-watchtower/
RUN cargo build --release --package fuel-canary-watchtower

FROM debian:latest

RUN apt-get update && \
    apt-get install -y libssl-dev pkg-config file strace libc6 libgcc1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=watchtower_builder /app/target/release/fuel-canary-watchtower /app/fuel-canary-watchtower
COPY ./docker/fuel-canary-watchtower/watchtower_config.json /app/watchtower_config.json

ENTRYPOINT ["/app/fuel-canary-watchtower"]
# Set the default command arguments
CMD ["/app/watchtower_config.json"]
