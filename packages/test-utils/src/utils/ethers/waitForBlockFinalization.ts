import type { JsonRpcProvider } from 'ethers';
import type { MessageProof } from 'fuels';
import { arrayify } from 'fuels';

import { debug } from '../logs';
import type { TestEnvironment } from '../setup';

import { hardhatSkipTime } from './hardhatSkipTime';
import { isHardhatProvider } from './isHardhatProvider';

export async function waitForBlockFinalization(
  env: TestEnvironment,
  messageProof: MessageProof
) {
  // connect to FuelChainState contract as the permissioned block comitter
  const fuelChainState = env.eth.fuelChainState.connect(env.eth.provider);

  // If we are connecting to a hardhat instance, we can speed up the wait
  if (await isHardhatProvider(env.eth.provider)) {
    const time = await fuelChainState.TIME_TO_FINALIZE();

    await hardhatSkipTime(env.eth.provider as JsonRpcProvider, time);

    const isFinalized = await fuelChainState.finalized(
      arrayify(messageProof.commitBlockHeader.id),
      messageProof.commitBlockHeader.height.toString()
    );

    if (isFinalized) return;
  }

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
