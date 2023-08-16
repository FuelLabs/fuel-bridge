FROM ghcr.io/fuellabs/fuel-block-committer:v0.1.0

ARG ETHEREUM_WALLET_KEY=""
ARG COMMIT_INTERVAL=1
ARG COMMITER_IP=0.0.0.0
ARG COMMITER_PORT=8888
ARG ETHEREUM_CHAIN="hardhat"
ARG ETHEREUM_RPC=""
ARG FUEL_GRAPHQL_ENDPOINT=""

# dependencies
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update && apt install -y curl jq && rm -rf /var/lib/apt/lists/*

# copy chain config
WORKDIR /block-committer

# expose fuel node port
ENV ETHEREUM_WALLET_KEY="${ETHEREUM_WALLET_KEY}"
ENV COMMIT_INTERVAL="${COMMIT_INTERVAL}"
ENV HOST="${COMMITER_IP}"
ENV PORT="${COMMITER_PORT}"
ENV ETHEREUM_CHAIN="${ETHEREUM_CHAIN}"
ENV ETHEREUM_RPC="${ETHEREUM_RPC}"
ENV FUEL_GRAPHQL_ENDPOINT="${FUEL_GRAPHQL_ENDPOINT}"
EXPOSE ${PORT}

# copy over script and run
COPY ./block-commiter.sh .
CMD ["sh", "./block-commiter.sh"]
