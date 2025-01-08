import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory } from '../../typechain';

const COMMITTER_ADDRESS = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;

  const [deployer] = await ethers.getSigners();

  const { address } = await deployments.get('FuelChainState');

  const fuelChainState = FuelChainState__factory.connect(address, deployer);
  const COMMITTER_ROLE = await fuelChainState.COMMITTER_ROLE();

  await fuelChainState
    .grantRole(COMMITTER_ROLE, COMMITTER_ADDRESS)
    .then((tx) => tx.wait());

  console.log('Granted role COMMITTER_ROLE to', COMMITTER_ADDRESS);
};

func.tags = ['register_committer'];
func.id = 'register_committer';
export default func;
