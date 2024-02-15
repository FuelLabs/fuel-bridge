import { toBeHex, type BigNumberish, type JsonRpcProvider } from 'ethers';

/**
 * @description jumps time in the blockchain by the specified amount of time
 * @param provider A provider that exposes hardhat_ methods
 */
export async function hardhatSkipTime(
  provider: JsonRpcProvider,
  time: BigNumberish
) {
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
