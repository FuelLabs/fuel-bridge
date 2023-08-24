import { TestEnvironment } from '../../setup';
import { delay } from '../delay';
import { debug } from '../logs';

// 5 seconds
const RETRY_DELAY = 5 * 1000;

export async function waitNextBlock(
  env: TestEnvironment,
  blockId: string
): Promise<string> {
  const fuelProvider = env.fuel.provider;

  debug('Checking if a new block is available...', blockId);
  const chain = await fuelProvider.getChain();
  const currentBlock = await fuelProvider.getBlock(blockId);

  if (chain.latestBlock.height.lte(currentBlock.height)) {
    debug(`Waiting for ${RETRY_DELAY}ms and check again`);
    await delay(RETRY_DELAY);
    return waitNextBlock(env, blockId);
  }

  // get the next block, instead of latest one
  const nextBlock = await fuelProvider.getBlock(currentBlock.height.add(1).toNumber());

  return nextBlock.id;
}
