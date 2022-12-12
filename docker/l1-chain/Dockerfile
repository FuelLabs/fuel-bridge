# ====== Build Image ======
FROM node:16-alpine AS BUILD_IMAGE

# dependencies
RUN apk --no-cache add git

# set workdir
WORKDIR /l1chain

# clone the contracts repo
#RUN git clone --depth 1 --branch <tag_name> https://github.com/FuelLabs/fuel-v2-contracts.git
RUN git clone --depth 1 --branch 4-add-contract-upgradeability https://github.com/FuelLabs/fuel-v2-contracts.git
WORKDIR /l1chain/fuel-v2-contracts

# build the ethereum contracts and environment
RUN npm ci
RUN npm run build

# remove build dependencies
RUN npm prune --omit=dev
COPY ./docker/l1-chain/hardhat.config.ts .



# ====== Final Image ======
FROM node:16-alpine

ARG L1_IP=0.0.0.0
ARG L1_PORT=9545
ARG SERVE_PORT=8081

# dependencies
RUN apk --no-cache add curl

# set workdir
WORKDIR /l1chain

# clone the contracts repo
COPY --from=BUILD_IMAGE /l1chain/fuel-v2-contracts ./fuel-v2-contracts
WORKDIR /l1chain/fuel-v2-contracts

# expose node and server port
ENV L1_IP="${L1_IP}"
ENV L1_PORT="${L1_PORT}"
ENV SERVE_PORT="${SERVE_PORT}"
EXPOSE ${L1_PORT}
EXPOSE ${SERVE_PORT}

# copy over script and run
COPY ./scripts/l1_chain.sh .
CMD ["sh", "./l1_chain.sh"]