# Stage 1: Use cargo-chef to generate a recipe
FROM lukemathwalker/cargo-chef:latest-rust-1.76-slim AS chef

# Install OpenSSL and pkg-config
RUN apt-get update && \
    apt-get install -y libssl-dev pkg-config && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Stage 2: Planner
FROM chef AS planner
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY packages/message-predicates/contract-message-predicate/Cargo.toml packages/message-predicates/contract-message-predicate/
COPY packages/fungible-token/bridge-fungible-token/Cargo.toml packages/fungible-token/bridge-fungible-token/
COPY packages/fuel-canary-watchtower packages/fuel-canary-watchtower/
RUN cargo chef prepare --recipe-path recipe.json

# Stage 3: Extract builder
FROM chef AS watchtower_builder
WORKDIR /app
COPY --from=planner /app/recipe.json /app/
COPY packages/fuel-canary-watchtower ./
RUN cargo chef cook --release --recipe-path recipe.json
RUN cargo build --release --package fuel-canary-watchtower

# Stage 4: Final stage
FROM debian:bookworm-slim
WORKDIR /app
COPY --from=watchtower_builder /app/target/release/fuel-canary-watchtower /app/fuel-canary-watchtower
ENTRYPOINT ["/app/fuel-canary-watchtower"]
