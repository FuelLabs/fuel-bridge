import { config as dotEnvConfig } from 'dotenv';
import * as path from 'path';
import type {
  StartedTestContainer,
  StartedDockerComposeEnvironment,
} from 'testcontainers';
import { DockerComposeEnvironment } from 'testcontainers';

dotEnvConfig();

export type Containers = {
  postGresContainer: StartedTestContainer;
  l1_node: StartedTestContainer;
  fuel_node: StartedTestContainer;
  block_committer: StartedTestContainer;
};

const PROJECT_ROOT = path.resolve(__dirname, '../../../');
let environment: StartedDockerComposeEnvironment;

// responsible for starting all containers
export async function startContainers() {
  // building images externally
  console.log('Setting up environment using docker compose...');
  environment = await new DockerComposeEnvironment(
    path.resolve(PROJECT_ROOT, 'docker'),
    'docker-compose.yml'
  )
    .withBuild()
    .up();

  console.log('Environment setup done...');

  const postGresContainer = environment.getContainer('db-1');

  const l1_node: StartedTestContainer = environment.getContainer('l1_chain-1');
  const fuel_node: StartedTestContainer =
    environment.getContainer('fuel_core-1');
  const block_committer: StartedTestContainer = environment.getContainer(
    'fuel_block_commiter-1'
  );

  return { postGresContainer, l1_node, fuel_node, block_committer };
}

export async function stopEnvironment(): Promise<void> {
  console.log('Stopping environment...');
  if (environment) {
    await environment.down();
  }
}
