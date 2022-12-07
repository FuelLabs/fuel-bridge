FROM node:16-alpine

# dependencies
RUN apk --no-cache add curl jq python3 

# copy over workspace
WORKDIR /deployer
COPY ./docker/deployer/fuel-v2-contracts ./fuel-v2-contracts

# build it
WORKDIR /deployer/fuel-v2-contracts
RUN npm ci
RUN npm run build

# expose deployer port
EXPOSE 8081

# copy over script and run
COPY ./scripts/deployer.sh .
CMD ["sh", "./deployer.sh"]
