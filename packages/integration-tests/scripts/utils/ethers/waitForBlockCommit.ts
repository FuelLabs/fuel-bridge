import { TestEnvironment } from '../../setup';
import { ZeroBytes32, bn } from 'fuels';
import { debug } from '../logs';
import { delay } from '../delay';

// 5 seconds
const RETRY_DELAY = 5 * 1000;

export async function waitForBlockCommit(env: TestEnvironment, height: string) {
  debug('Check block is commited on L1...');
  // connect to FuelChainState contract as the permissioned block comitter
  const fuelChainState = env.eth.fuelChainState.connect(env.eth.provider);
  const blocksPerCommitInterval = (
    await fuelChainState.BLOCKS_PER_COMMIT_INTERVAL()
  ).toString();

  // Add + 1 to the block height to wait the next block
  // that enable to proof the message
  const nextBlockHeight = bn(height).add(1);
  // To get the block slot where the block is going to be commited
  // We need to divide the desired block by the BLOCKS_PER_COMMIT_INTERVAL
  // and round up. Ex.: 225/100 sould be on the slot 3
  const { mod, div } = bn(nextBlockHeight).divmod(blocksPerCommitInterval);
  const commitHeight = mod.isZero() ? div : div.add(1);

  // check if the block is commited on L1 every second
  const commitHashAtL1 = await fuelChainState.blockHashAtCommit(
    commitHeight.toString()
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
