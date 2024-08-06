import type { FuelChainState } from '@fuel-bridge/solidity-contracts/typechain';
import { ZeroHash } from 'ethers';
import type { Provider } from 'fuels';
import { bn } from 'fuels';

import { getBlock } from '../fuels/getBlock';
import { debug } from '../logs';
import type { TestEnvironment } from '../setup';

export async function waitForBlockCommit(env: TestEnvironment, height: string) {
  debug(`Check block ${height} is commited on L1...`);
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

  const commitSlotIsEmpty = commitHashAtL1 === ZeroHash;

  // If the commit is missing, wait for a new commit
  if (commitSlotIsEmpty) {
    debug(`Commit height ${commitHeight} does not exist`);

    await tryToForwardFuelChain(env.fuel.provider, blocksPerCommitInterval);

    debug(`Waiting for a new L1 commit ${commitHeight.toString()}`);
    await waitForCommitEvent(fuelChainState, commitHeight.toString());
    return waitForBlockCommit(env, height);
  }

  // As we only have a limited amount of slots, the slot can contain
  // a block that was committed before we need to check if the block
  // height at the slot is greater than or equal to the target block height
  const block = await getBlock(env.fuel.provider.url, commitHashAtL1);
  const isCommited = bn(block.header.height).gte(nextBlockHeight);

  // If the commit is missing, wait for a new commit
  if (!isCommited) {
    debug(`Block ${block.header.id} is not commited on L1`);

    await tryToForwardFuelChain(env.fuel.provider, blocksPerCommitInterval);

    debug(`Waiting for a new L1 commit ${commitHeight.toString()}`);
    await waitForCommitEvent(fuelChainState, commitHeight.toString());
    return waitForBlockCommit(env, height);
  }

  // Return if is finalized
  debug('Block is commited on L1');
  return commitHashAtL1;
}

export async function waitForCommitEvent(
  fuelChainState: FuelChainState,
  commitHeight: string
) {
  const filter =
    fuelChainState.filters['CommitSubmitted(uint256,bytes32)'](commitHeight);

  const events = await fuelChainState.queryFilter(filter);

  if (events.length === 0) {
    return waitForCommitEvent(fuelChainState, commitHeight);
  }

  if (events.length > 1) {
    throw new Error(
      `
      Commit at height ${commitHeight} was duplicated,
      this most probably means there is a block committer issue
      `
    );
  }

  const [height, hash] = events[0].args;

  debug(`Commit submitted: height=${height} hash=${hash}`);
}

export async function tryToForwardFuelChain(
  provider: Provider,
  blocksToForward: string
) {
  const { name } = await provider.fetchChain();

  // If the chain is a local testnet, speed up the process
  // by trying to produce blocks and reach the desired height quickly
  if (name === 'Upgradable Testnet') {
    debug(`Forwarding fuel chain ${blocksToForward} blocks`);

    // If the request fails it is probably because --debug was not enabled
    // when initiating fuel-core
    await provider.produceBlocks(Number(blocksToForward)).catch(console.error);
  }
}
