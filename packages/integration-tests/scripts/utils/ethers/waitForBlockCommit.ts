import { TestEnvironment } from '../../setup';
import { CommitBlockHeader } from '../../types';
import { ZeroBytes32, bn } from 'fuels';
import { debug } from '../logs';
import { delay } from '../delay';

// 5 seconds
const RETRY_DELAY = 5 * 1000;

export async function waitForBlockCommit(
  env: TestEnvironment,
  height: string
) {
  debug('Check block is commited on L1...');
  // connect to FuelChainState contract as the permissioned block comitter
  const fuelChainState = env.eth.fuelChainState.connect(env.eth.provider);
  const BLOCKS_PER_COMMIT_INTERVAL = await fuelChainState.BLOCKS_PER_COMMIT_INTERVAL();

  // check if the block is commited on L1 every second
  const commitHashAtL1 = await fuelChainState.blockHashAtCommit(
    bn(height).div(BLOCKS_PER_COMMIT_INTERVAL.toString()).toString()
  );
  const isCommited = commitHashAtL1 !== ZeroBytes32;

  // If not commited, wait for TIMOUT_RETRY seconds and try again
  if (!isCommited) {
    debug(`Block is not commited on L1. Auto-retry in ${RETRY_DELAY}ms...`);
    await delay(RETRY_DELAY);
    return waitForBlockCommit(env, height);
  }

  // Return if is finalized
  debug('Block is commited on L1');
  return commitHashAtL1;
}
