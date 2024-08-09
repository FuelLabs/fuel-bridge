import { MaxUint256 } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortal } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { upgradeProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const { address: fuelMessagePortalAddress } = await get('FuelMessagePortal');

  const contract = await upgradeProxy(
    fuelMessagePortalAddress,
    new FuelMessagePortal(deployer),
    {
      constructorArgs: [MaxUint256, 604800], // rate limit duration => 1 week
    }
  );
  await contract.waitForDeployment();

  const tx = contract.deploymentTransaction();
  await tx.wait();

  const address = await contract.getAddress();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelMessagePortal at', address);
  await save('FuelMessagePortal', {
    address,
    abi: [...FuelMessagePortal.abi],
    implementation,
  });

  return true;
};

func.tags = ['portal_redeploy'];
func.id = 'fuel_message_portal_redeploy';
export default func;
