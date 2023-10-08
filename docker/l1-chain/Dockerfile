# ====== Build Image ======
FROM node:16-alpine AS BUILD_IMAGE

ARG L1_IP=0.0.0.0
ARG L1_PORT=9545
ARG SERVE_PORT=8081

# dependencies
RUN apk --no-cache add git curl
RUN npm i -g pnpm

# clone the contracts repo
ADD ./packages/solidity-contracts/package.json /l1chain/fuel-v2-contracts/
# copy over the fuel chain and replace consts values
WORKDIR /l1chain/fuel-v2-contracts

# build the ethereum contracts and environment
RUN pnpm install
# replace the fuel chain consts values and change contract code
ADD ./docker/l1-chain/.fuelChainConsts.env /l1chain/fuel-v2-contracts/.fuelChainConsts.env
ADD ./packages/solidity-contracts/scripts/replaceFuelChainConsts.ts /l1chain/fuel-v2-contracts/scripts/replaceFuelChainConsts.ts
ADD ./packages/solidity-contracts/contracts /l1chain/fuel-v2-contracts/contracts
ADD ./packages/solidity-contracts/scripts /l1chain/fuel-v2-contracts/scripts
ADD ./packages/solidity-contracts/protocol /l1chain/fuel-v2-contracts/protocol
RUN pnpm ts-node scripts/replaceFuelChainConsts.ts


# remove build dependencies
# RUN pnpm prune --prod
COPY ./docker/l1-chain/hardhat/hardhat.config.ts .
RUN pnpm compile

# Create deployments dir
RUN mkdir deployments

# expose node and server port
ENV L1_IP="${L1_IP}"
ENV L1_PORT="${L1_PORT}"
ENV SERVE_PORT="${SERVE_PORT}"
EXPOSE ${L1_PORT}
EXPOSE ${SERVE_PORT}

# copy over script and run
COPY ./docker/l1-chain/l1_chain.sh /l1chain/l1_chain.sh
CMD ["sh", "/l1chain/l1_chain.sh"]
