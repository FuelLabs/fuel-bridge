import type { TransactionResponse } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortal } from '../../typechain';

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
    redeployImplementation: 'always', // added this so we can mock legit upgrades by default
  })) as TransactionResponse;

  const receipt = await hre.ethers.provider.getTransactionReceipt(
    response.hash
  );

  const implementation = receipt?.contractAddress ?? '';

  if (implementation === '')
    throw new Error(
      `Upgrade proposal failed for FuelMessagePortalV3 proxy (${contractDeployment.address})`
    );

  await save('FuelMessagePortalV3', {
    address: contractDeployment.address,
    abi: [...FuelMessagePortal.abi],
    implementation,
    transactionHash: response.hash,
    linkedData: {
      factory: 'FuelMessagePortalV3',
      constructorArgs: contractDeployment.linkedData.constructorArgs,
    },
  });
};

func.tags = ['prepareUpgrade_fuel_message_portal'];
func.id = 'prepareUpgrade_fuel_message_portal';
export default func;
