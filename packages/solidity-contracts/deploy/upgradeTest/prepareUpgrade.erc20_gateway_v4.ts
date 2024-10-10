import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC20GatewayV4__factory as FuelERC20Gateway } from '../../typechain';
import { TransactionResponse } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    upgrades: { prepareUpgrade },
    deployments: { save },
  } = hre;

  const contractDeployment = await hre.deployments.get('FuelERC20GatewayV4');

  const factory = await hre.ethers.getContractFactory('FuelERC20GatewayV4');

  const response = (await prepareUpgrade(contractDeployment.address, factory, {
    kind: 'uups',
    constructorArgs: contractDeployment.linkedData.constructorArgs,
    getTxResponse: true,
    redeployImplementation: 'always', // added this so we can mock legit upgrades by default
  })) as TransactionResponse;

  const receipt = await hre.ethers.provider.getTransactionReceipt(
    response.hash
  );

  await save('FuelERC20GatewayV4', {
    address: contractDeployment.address,
    abi: [...FuelERC20Gateway.abi],
    implementation: receipt?.contractAddress!,
    transactionHash: response.hash,
    linkedData: {
      factory: 'FuelERC20GatewayV4',
      constructorArgs: contractDeployment.linkedData.constructorArgs,
    },
  });
};

func.tags = ['prepareUpgrade_erc20_gateway_v4'];
func.id = 'prepareUpgrade_erc20_gateway_v4';
export default func;
