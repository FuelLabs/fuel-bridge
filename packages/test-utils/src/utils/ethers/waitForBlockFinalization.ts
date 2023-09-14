import type { MessageProof } from 'fuels';
import { arrayify } from 'fuels';

import { debug } from '../logs';
import type { TestEnvironment } from '../setup';

export async function waitForBlockFinalization(
  env: TestEnvironment,
  messageProof: MessageProof
) {
  // connect to FuelChainState contract as the permissioned block comitter
  const fuelChainState = env.eth.fuelChainState.connect(env.eth.provider);

  return new Promise((resolve) => {
    debug('Waiting for block to be finalized on L1...');
    function onBlock() {
      fuelChainState
        .finalized(
          arrayify(messageProof.commitBlockHeader.id),
          messageProof.commitBlockHeader.height.toString()
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
