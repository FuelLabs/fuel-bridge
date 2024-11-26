# IMPORTANT!
# Make sure to check:
# https://github.com/FuelLabs/chain-configuration/tree/master/upgradelog/ignition-testnet
# and apply the latest state_transition_function and consensus_parameter
# when upgrading fuel-core
FROM ghcr.io/fuellabs/fuel-core:v0.40.0

ARG FUEL_IP=0.0.0.0
ARG FUEL_PORT=4001
ARG CONSENSUS_KEY_SECRET=""

# dependencies
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update && apt install -y git curl jq && rm -rf /var/lib/apt/lists/*

# copy chain config
WORKDIR /fuel

COPY ./genesis_coins.json .

RUN git clone \
    https://github.com/FuelLabs/chain-configuration.git \
    /chain-configuration

# Anchor the chain configuration to a specific commit to avoid CI breaking
RUN cd /chain-configuration && git checkout 8e4f7b52d7112f929a7cd95b988dfebfd10e87ec

# Copy the base local configuration
RUN cp -R /chain-configuration/local/* ./

# Copy the devnet consensus parameters and state transition bytecode
RUN cp /chain-configuration/upgradelog/ignition-devnet/consensus_parameters/14.json \
    ./latest_consensus_parameters.json
RUN cp /chain-configuration/upgradelog/ignition-devnet/state_transition_function/16.wasm \
    ./state_transition_bytecode.wasm

# update local state_config with custom genesis coins config
RUN jq '.coins = input' \
    state_config.json genesis_coins.json > tmp.json \
    && mv tmp.json state_config.json

# update local state_config with testnet consensus parameters
RUN jq '.consensus_parameters = input' \
    state_config.json latest_consensus_parameters.json > tmp.json \
    && mv tmp.json state_config.json

# expose fuel node port
ENV FUEL_IP="${FUEL_IP}"
ENV FUEL_PORT="${FUEL_PORT}"
ENV CONSENSUS_KEY_SECRET="${CONSENSUS_KEY_SECRET}"
EXPOSE ${FUEL_PORT}

# copy over script and run
COPY ./fuel_core.sh .
CMD ["sh", "./fuel_core.sh"]