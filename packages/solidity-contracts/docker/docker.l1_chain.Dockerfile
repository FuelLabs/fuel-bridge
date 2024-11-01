FROM node:20-alpine AS BUILD_IMAGE

# dependencies
RUN apk --no-cache add git curl
RUN npm i -g pnpm

WORKDIR /l1chain/fuel-v2-contracts

ARG L1_IP=0.0.0.0
ARG L1_PORT=8545

# clone the contracts repo
COPY package.json /l1chain/fuel-v2-contracts/

# copy over the fuel chain and replace consts values

# build the ethereum contracts and environment
RUN pnpm install
COPY contracts/test/PlaceHolder.sol /l1chain/fuel-v2-contracts/contracts/test/PlaceHolder.sol
COPY .env /l1chain/fuel-v2-contracts/
COPY hardhat.config.ts /l1chain/fuel-v2-contracts/
COPY scripts/ /l1chain/fuel-v2-contracts/scripts/
RUN pnpm compile

# replace the fuel chain consts values and change contract code
COPY contracts/ /l1chain/fuel-v2-contracts/contracts/
COPY deploy/ /l1chain/fuel-v2-contracts/deploy/
COPY protocol/ /l1chain/fuel-v2-contracts/protocol/


# remove build dependencies
# RUN pnpm prune --prod
RUN pnpm compile

ENV L1_IP="${L1_IP}"
ENV L1_PORT="${L1_PORT}"
EXPOSE ${L1_PORT}
EXPOSE ${SERVE_PORT}

# copy over script and run
COPY ./docker/l1-chain/l1_chain.sh /l1chain/l1_chain.sh
CMD ["sh", "/l1chain/l1_chain.sh"]
