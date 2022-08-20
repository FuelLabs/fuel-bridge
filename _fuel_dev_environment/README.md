# docker-compose

This docker-compose project runs a local fuel stack.

## prerequisites

- docker
- docker-compose

## Building the services

```bash
docker-compose build
```

## Starting and stopping the project

The base `docker-compose.yml` file will start the required components for a full stack.

The base stack can be started with a command like this:
```
docker-compose up --detach
```
And stopped with a command like this:
```
docker-compose down
```

*Note*: Docker Desktop only allocates 2GB of memory by default, which isn't enough to run the docker-compose services reliably.

To allocate more memory, go to Settings > Resources in the Docker UI and use the slider to change the value (_8GB recommended_). Make sure to click Apply & Restart for the changes to take effect.

## Basic config options

A set of basic environment variables can be set before running. The defaults are defined as:
```bash
L1CHAIN_HTTP_PORT=9545
FULE_CORE_HTTP_PORT=4000
DEPLOYER_PORT=8080
```

For example:
```bash
L1CHAIN_HTTP_PORT=9545 docker-compose up
```

## L1 chain shadow forking

The L1 chain can be set to shadow fork an existing chain by editing the environment variables found in `envs/l1_chain.env`
```bash
FORK_URL=
FORK_STARTING_BLOCK=
```
