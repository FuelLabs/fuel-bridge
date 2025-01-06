import type { JsonRpcProvider, Provider, BigNumberish } from 'ethers';
import { toBeHex } from 'ethers';
import type { MessageProof } from 'fuels';
import { arrayify } from 'fuels';

import { debug } from '../debug';
import type { TestEnvironment } from '../setup/setup';

/**
 * @description jumps time in the blockchain by the specified amount of time
 * @param provider A provider that exposes hardhat_ methods
 */
async function hardhatSkipTime(provider: any, time: BigNumberish) {
  const startingBlockNumber = await provider.getBlockNumber();
  const hexTime = toBeHex(time).replace(/^0x0+/, '0x');

  await provider.send('evm_increaseTime', [hexTime]);
  const success = await provider.send('hardhat_mine', ['0x1']);

  while (success) {
    if ((await provider.getBlockNumber()) > startingBlockNumber) break;
    await new Promise((resolve) => setTimeout(() => resolve(null), 100));
  }

  return success;
}

async function isHardhatProvider(provider: Provider) {
  if (!('send' in provider)) return false;

  try {
    const result = await (provider as JsonRpcProvider).send(
      'hardhat_metadata',
      []
    );

    return !!result?.clientVersion;
  } catch (e) {
    return null;
  }
}

export async function waitForBlockFinalization(
  env: TestEnvironment,
  messageProof: MessageProof
) {
  // connect to FuelChainState contract as the permissioned block comitter
  const fuelChainState = env.eth.fuelChainState.connect(env.eth.provider);

  // If we are connecting to a hardhat instance, we can speed up the wait
  if (await isHardhatProvider(env.eth.provider)) {
    const time = await fuelChainState.TIME_TO_FINALIZE();

    await hardhatSkipTime(env.eth.provider, time);

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
