# This image is built for external projects that want to have
# an e2e test environment
FROM ghcr.io/fuellabs/fuel-core:v0.31.0 as fuel-core
FROM ghcr.io/fuellabs/fuel-block-committer:v0.4.0 as fuel-committer

FROM node:20-slim as base
USER 0
ENV DEBIAN_FRONTEND=noninteractive
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

RUN apt update
RUN apt install -y curl git file jq

# Download and install forc binaries
FROM base as forc-downloader

ENV FORC_VERSION=v0.60.0
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then \
        FORC_URL="https://github.com/FuelLabs/sway/releases/download/$FORC_VERSION/forc-binaries-linux_arm64.tar.gz"; \
    elif [ "$ARCH" = "x86_64" ]; then \
        FORC_URL="https://github.com/FuelLabs/sway/releases/download/$FORC_VERSION/forc-binaries-linux_amd64.tar.gz"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    mkdir -p /tmp/forc-binaries && \
    curl -L $FORC_URL | tar -xz -C /tmp && \
    mv /tmp/forc-binaries/* /usr/local/bin/

# Download and install anvil
FROM base as foundry-downloader
RUN curl -L https://foundry.paradigm.xyz | bash
RUN /root/.foundry/bin/foundryup

FROM base as base-builder

COPY --from=fuel-core /root/fuel-core /root/fuel-core
COPY --from=fuel-committer /root/fuel-block-committer /root/fuel-block-committer
COPY --from=forc-downloader /usr/local/bin/forc* /usr/local/bin
COPY --from=foundry-downloader /root/.foundry /root/.foundry

ENV DEBIAN_FRONTEND=noninteractive
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm i -g pm2

WORKDIR /fuel-bridge

COPY packages packages
COPY package.json package.json
COPY pnpm-* .
COPY Forc* .
COPY fuel-toolchain.toml .
COPY tsconfig.json .
COPY turbo.json .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base-builder as sway-contracts
RUN cd /fuel-bridge/packages/esbuild-bin-loader && pnpm build
RUN cd /fuel-bridge && forc build --release
RUN cd /fuel-bridge/packages/fungible-token && pnpm build

FROM base-builder as solidity-contracts
RUN cd /fuel-bridge/packages/solidity-contracts && pnpm build

FROM solidity-contracts as full-env

COPY --from=sway-contracts /fuel-bridge/packages/esbuild-bin-loader /fuel-bridge/packages/esbuild-bin-loader 
COPY --from=sway-contracts /fuel-bridge/packages/fungible-token /fuel-bridge/packages/fungible-token

COPY docker/full-env/run.sh /run.sh

ENTRYPOINT [ "bash", "/run.sh" ]