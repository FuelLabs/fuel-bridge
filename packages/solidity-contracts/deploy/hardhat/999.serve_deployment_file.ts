import { promises as fs } from 'fs';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, ethers } = hre;
  const allDeployments = await deployments.all();
  const deploymentsFile: { [name: string]: string } = {};
  for (const key of Object.keys(allDeployments)) {
    deploymentsFile[key] = allDeployments[key].address;
  }

  const { address } = await deployments.get('FuelChainState');
  const state = FuelChainState__factory.connect(address, ethers.provider);

  deploymentsFile['BLOCKS_PER_COMMIT_INTERVAL'] = (
    await state.BLOCKS_PER_COMMIT_INTERVAL()
  ).toString();
  deploymentsFile['NUM_COMMIT_SLOTS'] = (
    await state.NUM_COMMIT_SLOTS()
  ).toString();
  deploymentsFile['TIME_TO_FINALIZE'] = (
    await state.TIME_TO_FINALIZE()
  ).toString();

  await fs.writeFile(
    'deployments/deployments.local.json',
    JSON.stringify(deploymentsFile, null, ' '),
    'utf-8'
  );
};

func.tags = ['all'];
func.id = 'all';
func.runAtTheEnd = true;
export default func;
