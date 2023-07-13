import { keccak256, toUtf8Bytes } from 'ethers/lib/utils';
import { TestEnvironment } from '../../setup';
import { CommitBlockHeader } from '../../types';
import { callEtherRPC } from './callEtherRPC';
import { computeBlockHash } from '../fuels/computeBlockHash';
import { BLOCKS_PER_COMMIT_INTERVAL, TIME_TO_FINALIZE } from '../constants';
import { bn } from 'fuels';

export async function commitBlock(
  env: TestEnvironment,
  commitBlockHeader: CommitBlockHeader
) {
  // wait for block header finalization
  const committerRole = keccak256(toUtf8Bytes('COMMITTER_ROLE'));
  const deployerAddress = await env.eth.deployer.getAddress();
  const isDeployerComitter = await env.eth.fuelChainState.hasRole(
    committerRole,
    deployerAddress
  );

  if (!isDeployerComitter) {
    // will need to wait for more blocks to be built and then a block to be comitted to the consensus contract
    throw new Error('Cannot make block commits');
  }

  // connect to FuelChainState contract as the permissioned block comitter
  const fuelChainState = env.eth.fuelChainState.connect(env.eth.deployer);

  // commit the given block
  const commitBlockTx = await fuelChainState.commit(
    computeBlockHash(commitBlockHeader),
    Math.floor(
      bn(commitBlockHeader.height).toNumber() / BLOCKS_PER_COMMIT_INTERVAL
    )
  );
  const commitBlockTxResult = await commitBlockTx.wait();
  if (commitBlockTxResult.status !== 1) {
    throw new Error('failed to call commit on block');
  }
}

export async function mockFinalization(env: TestEnvironment) {
  // move the clock forward to ensure finalization
  // TODO: for public test nets this call should fail, when that happens do a simple delay instead [await delay(5*60*1000);]
  await callEtherRPC(env.eth.jsonRPC, 'evm_increaseTime', [TIME_TO_FINALIZE]);
}
