FROM node:16-alpine

ARG ETHEREUM_RPC=""
ARG FUEL_GRAPHQL_ENDPOINT=""

# set workdir
WORKDIR /generator

# copy fiels to workdir
ADD ./tx-generator /generator

# build the ethereum contracts and environment
RUN npm install

ENV ETHEREUM_RPC="${ETHEREUM_RPC}"
ENV FUEL_GRAPHQL_ENDPOINT="${FUEL_GRAPHQL_ENDPOINT}"

CMD ["npm", "run", "start"]
