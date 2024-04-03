import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory } from '../../typechain';

const COMMITTER_ADDRESS = '0xd12663Fc8Dad968946EF7c715742B5f3814b618a';

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

  return true;
};

func.tags = ['portal', 'message_portal', 'FuelMessagePortal'];
func.id = 'fuel_message_portal';
export default func;
