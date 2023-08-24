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

  // In case the height of the message is exactly a multiple of the BLOCKS_PER_COMMIT_INTERVAL
  // we need to wait for the next block to be commited as only the next block includes the message
  // Ex.: 300/100
  const waitHeight = bn(height).mod(blocksPerCommitInterval).isZero()
    ? bn(height).add(1)
    : bn(height);
  // To get the block slot where the block is going to be commited
  // We need to divide the desired block by the BLOCKS_PER_COMMIT_INTERVAL
  // and round up. Ex.: 225/100 sould be on the slot 3
  const commitHeightResult = bn(waitHeight).divmod(blocksPerCommitInterval);
  const commitHeight = commitHeightResult.mod.isZero()
    ? commitHeightResult.div
    : commitHeightResult.div.add(1);

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
