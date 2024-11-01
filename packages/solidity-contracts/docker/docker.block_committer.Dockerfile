FROM ghcr.io/fuellabs/fuel-block-committer:v0.4.0

ARG ETHEREUM_WALLET_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
ARG COMMIT_INTERVAL=30
ARG COMMITER_IP=0.0.0.0
ARG COMMITER_PORT=8888
ARG ETHEREUM_CHAIN="hardhat"

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
EXPOSE ${PORT}

# copy over script and run
COPY ./docker/block-committer/block-committer.sh .
CMD ["sh", "./block-committer.sh"]