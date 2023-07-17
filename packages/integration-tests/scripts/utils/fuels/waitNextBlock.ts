import { TestEnvironment } from '../../setup';
import { delay } from '../delay';

export async function waitNextBlock(env: TestEnvironment, blockId: string): Promise<string> {
  const fuelProvider = env.fuel.provider;

  console.log('Checking if a new block is available...', blockId);
  const chain = await fuelProvider.getChain();
  const currentBlock = await fuelProvider.getBlock(blockId);

  if (chain.latestBlock.height.lte(currentBlock.height)) {
    console.log('Waiting for 1 minute and check again');
    await delay(60 * 1000);
    return waitNextBlock(env, blockId);
  }

  return chain.latestBlock.id;
}
