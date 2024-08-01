import { HardhatRuntimeEnvironment } from 'hardhat/types';

export async function haltBlockProduction(hre: HardhatRuntimeEnvironment) {
  await hre.network.provider.send('evm_setAutomine', [false]);
}

export async function resumeInstantBlockProduction(
  hre: HardhatRuntimeEnvironment
) {
  await hre.network.provider.send('evm_setAutomine', [true]);
}
