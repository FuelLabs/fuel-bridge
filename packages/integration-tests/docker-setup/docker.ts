import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { config as dotEnvConfig } from 'dotenv';
import * as path from 'path';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import { GenericContainer, Network } from 'testcontainers';
dotEnvConfig();

export type Containers = {
  postGresContainer: StartedTestContainer;
  l1_node: StartedTestContainer;
  fuel_node: StartedTestContainer;
  block_committer: StartedTestContainer;
};

// responsible for starting all containers
export async function startContainers(forkingEnabled: boolean) {
  const network = await new Network().start();

  const postGresContainer = await new PostgreSqlContainer('postgres:14')
    .withUsername('username')
    .withPassword('password')
    .withDatabase('committer_db')
    .withName('postgres')
    .withNetwork(network)
    .withHealthCheck({
      test: ['CMD-SHELL', 'pg_isready -U username -d committer_db'],
      interval: 5000,
      timeout: 5000,
      retries: 5,
    })
    .start();

  const l1_node: StartedTestContainer = await startL1ChainContainer(network);
  const fuel_node: StartedTestContainer = await startFuelNodeContainer(
    network,
    l1_node,
    forkingEnabled
  );
  const block_committer: StartedTestContainer =
    await startBlockCommitterContainer(
      network,
      postGresContainer,
      l1_node,
      fuel_node
    );

  return { postGresContainer, l1_node, fuel_node, block_committer };
}

async function startL1ChainContainer(network: StartedNetwork) {
  const IMAGE_NAME = 'fueldev/l1chain:latest';

  // since the docker file is doing some copying operations from the host machine so first building the image
  const projectRoot = path.resolve(__dirname, '../../../');
  const dockerfilePath = path.join(projectRoot, 'docker/l1-chain');

  const buildInstance = await GenericContainer.fromDockerfile(
    dockerfilePath
  ).build(IMAGE_NAME);

  const con: StartedTestContainer = await buildInstance
    .withExposedPorts(
      { host: 8545, container: 9545 },
      { host: 8080, container: 8081 }
    )
    .withNetwork(network)
    .withNetworkAliases('l1_chain')
    .withName('l1_chain')
    .withEnvironment({
      TENDERLY_RPC_URL: process.env.TENDERLY_RPC_URL
        ? process.env.TENDERLY_RPC_URL
        : '',
    })
    .start();

  return con;
}

async function startFuelNodeContainer(
  network: StartedNetwork,
  l1Container: StartedTestContainer,
  forkingEnabled: boolean
) {
  if (l1Container) {
    const l1ChainIp = l1Container.getIpAddress(network.getName());

    const deployerAddresses = await fetch(
      `http://${l1Container.getHost()}:8080/deployments.local.json`
    ).then((resp) => resp.json());

    const container = await new GenericContainer(
      'ghcr.io/fuellabs/fuel-core:v0.40.0'
    )
      .withCommand(
        forkingEnabled
          ? `./fuel-core run --ip 0.0.0.0 --port 4001 --utxo-validation --vm-backtrace --enable-relayer --relayer http://${l1ChainIp}:9545 --relayer-v2-listening-contracts ${deployerAddresses.FuelMessagePortal} --poa-interval-period 1sec --da-compression 3600sec --graphql-max-complexity 500000 --relayer-da-deploy-height=21371952 --debug --min-gas-price 0`.split(
              ' '
            )
          : `./fuel-core run --ip 0.0.0.0 --port 4001 --utxo-validation --vm-backtrace --enable-relayer --relayer http://${l1ChainIp}:9545 --relayer-v2-listening-contracts ${deployerAddresses.FuelMessagePortal} --poa-interval-period 1sec --da-compression 3600sec --graphql-max-complexity 500000 --debug --min-gas-price 0`.split(
              ' '
            )
      )
      .withNetworkAliases('fuel_core')
      .withExposedPorts({ container: 4001, host: 4000 })
      .withName('fuel_node')
      .withNetwork(network)
      .withEnvironment({
        RUST_LOG: 'debug',
        DEBUG: 'true',
        CONSENSUS_KEY_SECRET:
          '0xa449b1ffee0e2205fa924c6740cc48b3b473aa28587df6dab12abc245d1f5298',
        FUEL_IP: `0.0.0.0`,
        FUEL_PORT: '4001',
      })
      .withHealthCheck({
        test: [
          'CMD',
          'curl --fail http://127.0.0.1:4001/v1/playground || exit 1',
        ],
        interval: 1000,
        timeout: 3000,
        retries: 5,
        startPeriod: 1000,
      })
      .start();

    return container;
  }
}

async function startBlockCommitterContainer(
  network: StartedNetwork,
  postgresContainer: StartedPostgreSqlContainer,
  l1Container: StartedTestContainer,
  fuelNodeContainer: StartedTestContainer
) {
  const projectRoot = path.resolve(__dirname, '../../../');
  const dockerfilePath = path.join(
    projectRoot,
    'docker/block-committer'
  );

  if (postgresContainer && l1Container && fuelNodeContainer) {
    const l1ChainIp = l1Container.getIpAddress(network.getName());
    const fuelcoreip = fuelNodeContainer.getIpAddress(network.getName());

    const db = postgresContainer.getIpAddress(network.getName());

    const IMAGE_NAME = 'block-committer';

    const buildInstance = await GenericContainer.fromDockerfile(
      dockerfilePath
    ).build(IMAGE_NAME);

    const deployerAddresses = await fetch(
      `http://${l1Container.getHost()}:8080/deployments.local.json`
    ).then((resp) => resp.json());

    const container = await buildInstance
      .withName('block-committer')
      .withNetwork(network)
      .withEnvironment({
        COMMITTER__ETH__RPC: `ws://${l1ChainIp}:9545/`,
        COMMITTER__FUEL__GRAPHQL_ENDPOINT: `http://${fuelcoreip}:4001/graphql`,
        COMMITTER__FUEL__NUM_BUFFERED_REQUESTS: '5',
        COMMITTER__APP__DB__PORT: '5432',
        COMMITTER__APP__DB__HOST: db,
        COMMITTER__APP__DB__MAX_CONNECTIONS: '10',
        ETHEREUM_WALLET_KEY:
          '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        COMMIT_INTERVAL: '30',
        COMMITTER__APP__DB__USERNAME: 'username',
        COMMITTER__APP__DB__PASSWORD: 'password',
        COMMITTER__ETH__L1_KEYS__MAIN:
          'Private(8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba)',
        COMMITTER__ETH__L1_KEYS__BLOB:
          'Private(59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d)',
        COMMITTER__APP__DB__USE_SSL: 'false',
        COMMITTER__APP__DB__DATABASE: 'committer_db',
        COMMITTER__APP__PORT: '8080',
        COMMITTER__APP__HOST: '0.0.0.0',
        COMMITTER__APP__BLOCK_CHECK_INTERVAL: '5s',
        COMMITTER__APP__TX_FINALIZATION_CHECK_INTERVAL: '5s',
        COMMITTER__APP__NUM_BLOCKS_TO_FINALIZE_TX: '3',
        COMMITTER__APP__GAS_BUMP_TIMEOUT: '300s',
        COMMITTER__APP__TX_MAX_FEE: '4000000000000000',
        COMMITTER__APP__SEND_TX_REQUEST_TIMEOUT: '10s',
        COMMITTER__APP__BUNDLE__ACCUMULATION_TIMEOUT: '3600s',
        COMMITTER__APP__BUNDLE__BLOCKS_TO_ACCUMULATE: '400',
        COMMITTER__APP__BUNDLE__OPTIMIZATION_TIMEOUT: '60s',
        COMMITTER__APP__BUNDLE__BLOCK_HEIGHT_LOOKBACK: '8500',
        COMMITTER__APP__BUNDLE__COMPRESSION_LEVEL: 'level6',
        COMMITTER__APP__BUNDLE__OPTIMIZATION_STEP: '100',
        COMMITTER__ETH__STATE_CONTRACT_ADDRESS:
          deployerAddresses.FuelChainState,
        COMMITTER__APP__BUNDLE__FRAGMENTS_TO_ACCUMULATE: '3',
        COMMITTER__APP__BUNDLE__FRAGMENT_ACCUMULATION_TIMEOUT: '10m',
        COMMITTER__APP__BUNDLE__NEW_BUNDLE_CHECK_INTERVAL: '3s',
        DEPLOYMENTS_HTTP: `http://${l1ChainIp}:8081/deployments.local.json`,
        HEALTH_URL: `http://${fuelcoreip}:4001/v1/health`,
      })

      .start();

    return container;
  }
}
