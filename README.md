# Fuel Development Environment

This docker-compose project runs a local Fuel development environment with both an L1 node and a Fuel node.

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

A set of environment variables can be set before running.

You can change this configs on the env files;
- [Fuel Core env](./envs/fuel_core.env)
- [L1 env](./envs/l1_chain.env)

## Change HOST ports;

With this set of env variables you can change in witch port L1 and FuelCore will be bind to the host env.

This is the list of envs and the default values assigned to it;
```bash
L1_CHAIN_HTTP_PORT=9545
DEPLOYMENTS_PORT=8080
FUEL_CORE_HTTP_PORT=4000
```

You can change this by exposing on local variables example;
```bash
L1_CHAIN_HTTP_PORT=9545 docker-compose up
```
