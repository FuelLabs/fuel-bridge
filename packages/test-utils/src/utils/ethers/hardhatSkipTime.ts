import type { JsonRpcProvider } from '@ethersproject/providers';
import type { BigNumberish } from 'ethers';
import { BigNumber } from 'ethers';

/**
 * @description jumps time in the blockchain by the specified amount of time
 * @param provider A provider that exposes hardhat_ methods
 */
export async function hardhatSkipTime(
  provider: JsonRpcProvider,
  time: BigNumberish
) {
  const hexTime = BigNumber.from(time).toHexString().replace(/^0x0+/, '0x');

  await provider.send('hardhat_mine', ['0x1', hexTime]);
}
