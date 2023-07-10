# ====== Build Image ======
FROM node:16-alpine AS BUILD_IMAGE

# dependencies
RUN apk --no-cache add git
RUN npm i -g pnpm

# set workdir
WORKDIR /l1chain

# clone the contracts repo
ADD ./packages/portal-contracts /l1chain/fuel-v2-contracts
WORKDIR /l1chain/fuel-v2-contracts

# build the ethereum contracts and environment
RUN pnpm install
RUN pnpm run build

# remove build dependencies
# RUN pnpm prune --prod
COPY ./docker/l1-chain/hardhat/hardhat.config.ts .

# ====== Final Image ======
FROM node:16-alpine

ARG L1_IP=0.0.0.0
ARG L1_PORT=9545
ARG SERVE_PORT=8081

# dependencies
RUN apk --no-cache add curl
RUN npm i -g pnpm

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
COPY ./docker/l1-chain/l1_chain.sh /l1chain/l1_chain.sh
CMD ["sh", "/l1chain/l1_chain.sh"]