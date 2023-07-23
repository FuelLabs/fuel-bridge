import { TestEnvironment } from '../../setup';
import { CommitBlockHeader } from '../../types';
import { bn } from 'fuels';
import { debug } from '../logs';
import { computeBlockHash } from '../fuels/computeBlockHash';

export async function waitForBlockFinalization(
  env: TestEnvironment,
  commitBlockHeader: CommitBlockHeader
) {
  // connect to FuelChainState contract as the permissioned block comitter
  const fuelChainState = env.eth.fuelChainState.connect(env.eth.provider);

  return new Promise((resolve) => {
    debug('Waiting for block to be finalized on L1...');
    function onBlock() {
      fuelChainState
        .finalized(
          computeBlockHash(commitBlockHeader),
          bn(commitBlockHeader.height).toNumber()
        )
        .then((isFinalized) => {
          if (isFinalized) {
            env.eth.provider.removeListener('block', onBlock);
            debug('Block is finalized on L1');
            resolve(true);
          }
        })
        .catch(() => {});
    }
    env.eth.provider.addListener('block', onBlock);
  });
}
