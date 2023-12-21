FROM ghcr.io/fuellabs/fuel-core:v0.22.0

ARG FUEL_IP=0.0.0.0
ARG FUEL_PORT=4001
ARG CONSENSUS_KEY_SECRET=""

# dependencies
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update && apt install -y curl jq && rm -rf /var/lib/apt/lists/*

# copy chain config
WORKDIR /fuel
COPY ./chainConfig.json .

# expose fuel node port
ENV FUEL_IP="${FUEL_IP}"
ENV FUEL_PORT="${FUEL_PORT}"
ENV CONSENSUS_KEY_SECRET="${CONSENSUS_KEY_SECRET}"
EXPOSE ${FUEL_PORT}

# copy over script and run
COPY ./fuel_core.sh .
CMD ["sh", "./fuel_core.sh"]
