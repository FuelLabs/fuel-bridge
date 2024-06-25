import { HardhatRuntimeEnvironment } from 'hardhat/types';

export async function haltBlockProduction(hre: HardhatRuntimeEnvironment) {
  await hre.network.provider.send('evm_setAutomine', [false]);
  await hre.network.provider.send('evm_setIntervalMining', [0]);
}

export async function resumeInstantBlockProduction(
  hre: HardhatRuntimeEnvironment,
  interval = 0
) {
  await hre.network.provider.send('evm_setAutomine', [true]);
  await hre.network.provider.send('evm_setIntervalMining', [interval]);
}
