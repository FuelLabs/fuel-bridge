import { TestEnvironment } from '../../setup';
import { CommitBlockHeader } from '../../types';
import { ZeroBytes32, bn } from 'fuels';
import { debug } from '../logs';
import { delay } from '../delay';
import { computeBlockHash } from '../fuels/computeBlockHash';
import { ethers } from 'ethers';

// 1 second
const COMMIT_TIMOUT_RETRY = 5000;
// Two minutes
const FINALIZE_TIMOUT_RETRY = 1 * 1000 * 60;

export async function waitForBlockCommit(
  env: TestEnvironment,
  commitBlockHeader: CommitBlockHeader
) {
  debug('Check block is commited on L1...');
  // connect to FuelChainState contract as the permissioned block comitter
  const fuelChainState = env.eth.fuelChainState.connect(env.eth.provider);

  // check if the block is commited on L1 every second
  const commitHashAtL1 = await fuelChainState.blockHashAtCommit(
    commitBlockHeader.height
  );
  const isCommited = commitHashAtL1 !== ZeroBytes32;

  // If not commited, wait for TIMOUT_RETRY seconds and try again
  if (!isCommited) {
    debug(
      `Block is not commited on L1. Auto-retry in ${COMMIT_TIMOUT_RETRY / 1000}s...`
    );
    await delay(COMMIT_TIMOUT_RETRY);
    return waitForBlockCommit(env, commitBlockHeader);
  }

  // Return if is finalized
  debug('Block is commited on L1');
  return isCommited;
}

export async function waitForBlockFinalization(
  env: TestEnvironment,
  commitBlockHeader: CommitBlockHeader
) {
  // connect to FuelChainState contract as the permissioned block comitter
  const fuelChainState = env.eth.fuelChainState.connect(env.eth.provider);

  try {
    const isFinalized = await fuelChainState.finalized(
      computeBlockHash(commitBlockHeader),
      bn(commitBlockHeader.height).toNumber()
    );
    if (!isFinalized) {
      throw new Error('Block is not finalized yet');
    }
    // Return if is finalized
    debug('Block is finalized on L1');
    return isFinalized;
  } catch {
    debug(
      `Block is not finalized yet. Auto-retry in ${FINALIZE_TIMOUT_RETRY / 1000}s...`
    );
    await delay(FINALIZE_TIMOUT_RETRY);
    return waitForBlockFinalization(env, commitBlockHeader);
  }
}
