import type { Provider as ETHProvider } from '@ethersproject/providers';
import type { FuelChainState } from '@fuel-bridge/solidity-contracts/typechain';
import type { Provider} from 'fuels';
import { bn } from 'fuels';

import { delay } from '../delay';
import { getBlock } from '../fuels/getBlock';
import { debug } from '../logs';
import type { TestEnvironment } from '../setup';

// 5 seconds
const RETRY_DELAY = 5 * 1000;

type BlockFinalizedConfigs = {
  ethProvider: ETHProvider;
  fuelProvider: Provider;
  fuelChainStateContract: FuelChainState;
}

export async function getBlockCommitStatus(configs: BlockFinalizedConfigs, height: string) {
  const { fuelChainStateContract, ethProvider, fuelProvider } = configs;
  const fuelChainState = fuelChainStateContract.connect(ethProvider);
  const blocksPerCommitInterval = (
    await fuelChainState.BLOCKS_PER_COMMIT_INTERVAL()
  ).toString();

  // Add + 1 to the block height to wait the next block
  // that enable to proof the message
  const nextBlockHeight = bn(height).add(1);
  // To get the block slot where the block is going to be committed
  // We need to divide the desired block by the BLOCKS_PER_COMMIT_INTERVAL
  // and round up. Ex.: 225/100 should be on the slot 3
  const { mod, div } = bn(nextBlockHeight).divmod(blocksPerCommitInterval);
  const commitHeight = mod.isZero() ? div : div.add(1);

  // check if the block is committed on L1 every second
  const commitHashAtL1 = await fuelChainState.blockHashAtCommit(
    commitHeight.toString()
  );
  // As we only have a limited amount of slots, the slot can contain
  // a block that was committed before we need to check if the block
  // height at the slot is greater than or equal to the target block height
  const block = await getBlock(fuelProvider.url, commitHashAtL1);
  const isCommitted = bn(block?.header.height).gte(nextBlockHeight);

  return {
    isCommitted,
    commitHashAtL1,
    block,
  }
}

export async function waitForBlockCommit(env: TestEnvironment, height: string) {
  debug('Check block is committed on L1...');
  // connect to FuelChainState contract as the permissioned block comitter
  const { isCommitted, commitHashAtL1 } = await getBlockCommitStatus({
    ethProvider: env.eth.provider,
    fuelProvider: env.fuel.provider,
    fuelChainStateContract: env.eth.fuelChainState,
  }, height);

  // If not committed, wait for TIMEOUT_RETRY seconds and try again
  if (!isCommitted) {
    debug(`Block is not committed on L1. Auto-retry in ${RETRY_DELAY}ms...`);
    await delay(RETRY_DELAY);
    return waitForBlockCommit(env, height);
  }

  // Return if is finalized
  debug('Block is committed on L1');
  return commitHashAtL1;
}
