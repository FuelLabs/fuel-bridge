import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortal } from '../../typechain';
import { TransactionResponse } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    upgrades: { prepareUpgrade },
    deployments: { save },
  } = hre;

  const contractDeployment = await hre.deployments.get('FuelMessagePortalV3');

  const factory = await hre.ethers.getContractFactory('FuelMessagePortalV3');

  const response = (await prepareUpgrade(contractDeployment.address, factory, {
    kind: 'uups',
    constructorArgs: contractDeployment.linkedData.constructorArgs,
    getTxResponse: true,
  })) as TransactionResponse;

  const receipt = await hre.ethers.provider.getTransactionReceipt(
    response.hash
  );

  await save('FuelMessagePortalV3', {
    address: contractDeployment.address,
    abi: [...FuelMessagePortal.abi],
    implementation: receipt?.contractAddress!,
    transactionHash: response.hash,
    linkedData: {
      factory: 'FuelMessagePortalV3',
      constructorArgs: contractDeployment.linkedData.constructorArgs,
      initArgs: contractDeployment.linkedData.initArgs,
    },
  });
};

func.tags = ['prepareUpgrade_fuel_message_portal'];
func.id = 'prepareUpgrade_fuel_message_portal';
export default func;
