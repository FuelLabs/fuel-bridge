# ====== Build Image ======
FROM node:20-alpine AS BUILD_IMAGE

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

# Take advantage of cache by putting a placeholder and downloading the compiler
ADD ./docker/l1-chain/Placeholder.sol /l1chain/fuel-v2-contracts/contracts/Placeholder.sol
ADD ./packages/solidity-contracts/hardhat.config.ts .
ADD ./packages/solidity-contracts/scripts /l1chain/fuel-v2-contracts/scripts
RUN pnpm compile

# replace the fuel chain consts values and change contract code
ADD ./docker/l1-chain/.fuelChainConsts.env /l1chain/fuel-v2-contracts/.fuelChainConsts.env
ADD ./packages/solidity-contracts/contracts /l1chain/fuel-v2-contracts/contracts
ADD ./packages/solidity-contracts/deploy /l1chain/fuel-v2-contracts/deploy
ADD ./packages/solidity-contracts/protocol /l1chain/fuel-v2-contracts/protocol


# remove build dependencies
# RUN pnpm prune --prod
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
