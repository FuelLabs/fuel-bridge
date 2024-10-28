import { type Provider as FuelProvider, type BigNumberish } from 'fuels';

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
