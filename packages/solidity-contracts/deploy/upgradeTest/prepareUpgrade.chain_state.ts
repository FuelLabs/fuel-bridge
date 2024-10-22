import type { TransactionResponse } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory as FuelChainState } from '../../typechain';

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
    redeployImplementation: 'always', // added this so we can mock legit upgrades by default
  })) as TransactionResponse;

  const receipt = await hre.ethers.provider.getTransactionReceipt(
    response.hash
  );

  const implementation = receipt?.contractAddress ?? '';

  if (implementation === '')
    throw new Error(
      `Upgrade proposement failed for FuelChainState proxy (${contractDeployment.address})`
    );

  await save('FuelChainState', {
    address: contractDeployment.address,
    abi: [...FuelChainState.abi],
    implementation,
    transactionHash: response.hash,
    linkedData: {
      constructorArgs: contractDeployment.linkedData.constructorArgs,
      factory: 'FuelChainState',
    },
  });
};

func.tags = ['prepareUpgrade_chain_state'];
func.id = 'prepareUpgrade_chain_state';
export default func;
