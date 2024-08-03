import { type Provider as FuelProvider, type BigNumberish, BN } from 'fuels';

export async function waitForBlock(
  blockNumber: BigNumberish,
  provider: FuelProvider
) {
  const currentBlock = await provider.getBlockNumber();

  if (currentBlock.lt(blockNumber)) {
    return waitForBlock(blockNumber, provider);
  }

  return currentBlock;
}
