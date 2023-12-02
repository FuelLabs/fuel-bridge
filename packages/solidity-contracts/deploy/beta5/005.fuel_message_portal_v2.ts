import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV2__factory as FuelMessagePortalV2 } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { upgradeProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const fuelMessagePortal = await get('FuelMessagePortal');

  const { deployTransaction, address } = await upgradeProxy(
    fuelMessagePortal,
    new FuelMessagePortalV2(deployer),
    {
      unsafeAllow: ['constructor'],
      constructorArgs: [ethers.constants.MaxUint256],
    }
  );

  await deployTransaction.wait();
  const implementation = await erc1967.getImplementationAddress(address);

  await save('FuelMessagePortal', {
    address,
    abi: [],
    implementation,
  });

  return true;
};

func.tags = ['upgrade_portal_v2', 'message_portal_v2', 'FuelMessagePortalV2'];
func.id = 'fuel_message_portal_v2_upgrade';
export default func;
