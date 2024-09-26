import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory as FuelChainState } from '../../typechain';
import { TransactionResponse, getCreateAddress } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    upgrades: { prepareUpgrade },
    deployments: { save },
  } = hre;

  const contractDeployment = await hre.deployments.get('FuelChainState');

  const factory = await hre.ethers.getContractFactory('FuelChainState');

  const response = (await prepareUpgrade(contractDeployment.address, factory, {
    kind: 'uups',
    constructorArgs: contractDeployment.linkedData.constructorArgs,
    getTxResponse: true,
  })) as TransactionResponse;

  const receipt = await hre.ethers.provider.getTransactionReceipt(
    response.hash
  );

  await save('FuelChainState', {
    address: contractDeployment.address,
    abi: [...FuelChainState.abi],
    implementation: contractDeployment.implementation,
    transactionHash: response.hash,
    linkedData: {
      constructorArgs: contractDeployment.linkedData.constructorArgs,
      factory: 'FuelChainState',
      initArgs: contractDeployment.linkedData.initArgs,
      isProxy: false,
      newImplementation: receipt?.contractAddress,
    },
  });
};

func.tags = ['prepareUpgrade_chain_state'];
func.id = 'prepareUpgrade_chain_state';
export default func;
