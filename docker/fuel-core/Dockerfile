FROM ghcr.io/fuellabs/fuel-core:v0.19.1

ARG FUEL_IP=0.0.0.0
ARG FUEL_PORT=4001
ARG SERVE_PORT=8081
ARG CONSENSUS_KEY_SECRET=""

# dependencies
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update && apt install -y curl jq && rm -rf /var/lib/apt/lists/*

# copy chain config
WORKDIR /fuel/project
COPY ./ .
# Add NodeSource distributions for Node.js
RUN curl -sL https://deb.nodesource.com/setup_18.x | bash -
RUN apt-get install -y nodejs
# RUN apk --no-cache add curl
RUN npm i -g pnpm
RUN pnpm install

WORKDIR /fuel
COPY ./docker/fuel-core/chainConfig.json .

# expose fuel node port
ENV FUEL_IP="${FUEL_IP}"
ENV FUEL_PORT="${FUEL_PORT}"
ENV CONSENSUS_KEY_SECRET="${CONSENSUS_KEY_SECRET}"
ENV SERVE_PORT="${SERVE_PORT}"
EXPOSE ${FUEL_PORT}
EXPOSE ${SERVE_PORT}

# copy over script and run
COPY ./docker/fuel-core/fuel_core.sh .
COPY ./docker/fuel-core/post_fuel_core.sh .
CMD ["sh", "./fuel_core.sh"]
