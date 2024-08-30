import { MaxUint256 } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortalV3 } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { upgradeProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const fuelMessagePortal = await get('FuelMessagePortal');

  const deployment = await upgradeProxy(
    fuelMessagePortal.address,
    new FuelMessagePortalV3(deployer),
    {
      unsafeAllow: ['constructor'],
      constructorArgs: [MaxUint256],
    }
  );

  const deployTx = await ethers.provider.getTransaction(
    (deployment as any).deployTransaction.hash
  );
  await deployTx.wait();

  const address = await deployment.getAddress();

  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Upgraded FuelMessagePortal to', implementation);
  await save('FuelMessagePortal', {
    address,
    abi: [...FuelMessagePortalV3.abi],
    implementation,
  });

  return true;
};

func.tags = ['portal_upgrade_2'];
func.id = 'portal_upgrade_2';
export default func;
