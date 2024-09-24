import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortal } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    upgrades: { prepareUpgrade },
    deployments: { save },
  } = hre;

  const contractDeployment = await hre.deployments.get('FuelMessagePortalV3');

  const contract = await hre.ethers.getContractFactory('FuelMessagePortalV3');

  const implementationAddress = await prepareUpgrade(
    contractDeployment.address,
    contract,
    {
      kind: 'uups',
      constructorArgs: contractDeployment.linkedData.constructorArgs,
    }
  );

  await save('FuelMessagePortalV3', {
    address: contractDeployment.address,
    abi: [...FuelMessagePortal.abi],
    implementation: contractDeployment.implementation,
    linkedData: {
      factory: 'FuelMessagePortalV3',
      constructorArgs: contractDeployment.linkedData.constructorArgs,
      initArgs: contractDeployment.linkedData.initArgs,
      isProxy: false,
      newImplementation: implementationAddress.toString(),
    },
  });
};

func.tags = ['prepareUpgrade_fuel_message_portal'];
func.id = 'prepareUpgrade_fuel_message_portal';
export default func;
