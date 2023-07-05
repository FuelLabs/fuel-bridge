# Fuel Development Environment

This project runs a local Fuel development environment with both an L1 node and a Fuel node.

## Requirements

- docker
- docker-compose
- make

*Note*: Docker Desktop only allocates 2GB of memory by default, which isn't enough to run the docker-compose services reliably.

To allocate more memory, go to Settings > Resources in the Docker UI and use the slider to change the value (_8GB recommended_). Make sure to click Apply & Restart for the changes to take effect.


## Commands

### Starting containers

To start all containers and build it, use;
```
make up
```

### Stop containers

To stop to containers, use;
```
make stop
```

### Clean containers

To remove all images and containers, use;
```
make clean
```

### View logs

To open the logs from the env, use;
```
make logs
```

## Config options

A set of environment variables can be set before running.

You can change this configs on the env files;
- [Fuel Core env](./envs/fuel_core.env) Fuel Core configurations.
- [L1 env](./envs/l1_chain.env) L1 configurations.
- [PORTS](./envs/ports.env): Exposed ports on host machine.

## License

This repo is licensed under the `Apache-2.0` license. See [`LICENSE`](./LICENSE) for more information.