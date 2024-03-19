import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortalV3 } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    deployments: { get },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const { address } = await get('FuelMessagePortal');

  const portal = FuelMessagePortalV3.connect(address, deployer);

  await portal
    .unpauseWithdrawals()
    .then((tx) => {
      console.log('Sending tx', tx.hash);
      return tx.wait();
    })
    .then(() => console.log('Withdrawals unpaused'));

  return true;
};

func.tags = ['unpause_withdrawals'];
func.id = 'unpause_withdrawals';
export default func;
