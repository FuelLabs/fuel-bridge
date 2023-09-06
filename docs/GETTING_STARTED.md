# Getting Started

## Requirements

This project includes both frontend and contracts. To begin, install dependencies:

- [Node.js v18.14.1 or latest stable](https://nodejs.org/en/). We recommend using [nvm](https://github.com/nvm-sh/nvm) to install.
- [PNPM v8.6.6 or latest stable](https://pnpm.io/installation/)
- [Docker v20.0.21 or latest stable](https://docs.docker.com/get-docker/)
- [Docker Compose v2.15.1 or latest stable](https://docs.docker.com/get-docker/)
- [Rust v1.72.0 or latest `stable`](https://www.rust-lang.org/tools/install)
- [Forc v0.44.1 with latest toolchain](https://install.fuel.network/latest)

## Running Project Locally

### 📚 - Getting the Repository

1. Visit the [Fuel Bridge](https://github.com/FuelLabs/fuel-bridge) repo and fork the project.
2. Then clone your forked copy to your local machine and get to work.

```sh
git clone https://github.com/FuelLabs/fuel-bridge.git
cd fuel-bridge
```

### 📦 - Install Dependencies

```sh
pnpm install
```

### 📒 - Run Nodes

In this step, we are going to;

- launch a local `fuel node` and a local `ethereum node`;

```sh
pnpm node:up
```

To stop the nodes, run:

```sh
pnpm node:stop
```

To clean the nodes, run:

```sh
pnpm node:clean
```

## 📗 Project Overview

This section has a brief description of each directory. More details can be found inside each package, by clicking on the links.

- [packages/fungible-token](../packages/fungible-token/) The contract that bridges ECR20 tokens into Fuel using the message bridge;
- [packages/message-predicates](../packages/message-predicates/) The predicates that receive the data from the base layer into Fuel;
- [packages/portal-contracts](../packages/portal-contracts/) The Fuel Solidity contracts architecture for state and message bridging;
- [packages/integration-tests](../packages/integration-tests/) Integration tests for the Fuel Messaging Bridge;
- [docker](../docker/) Docker configuration with L1 and Fuel Core working together.

## 🧰 Useful Scripts

To make life easier we added as many useful scripts as possible to our [package.json](../package.json). These are some of the most used during development:

```sh
pnpm <command name>
```

| Script       | Description                                                                             |
| ------------ | --------------------------------------------------------------------------------------- |
| `build`      | Run all build commands generating the artifacts needed to run tests or deploy packages. |
| `test`       | Run all the tests from all the packages                                                 |
| `node:up`    | Run the local network with `fuel-core` and the `ethereum node`.                         |
| `node:clean` | Stop and remove all development containers that are running locally.                    |
| `node:stop`  | Stop all containers without removing data                                               |

> Other scripts can be found in [package.json](../package.json).

## Run Tests

The command below runs a script that starts the nodes, waits for them to be available and then executes the tests.

```sh
pnpm test
```
