import type { TransactionResponse } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory as FuelChainState } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    upgrades: { prepareUpgrade },
    deployments: { save },
  } = hre;

  console.log("Upgrading FuelChainState contract");

  const contractDeployment = await hre.deployments.get('FuelChainState');

  const BLOCKS_PER_COMMIT_INTERVAL = 10800;
  const TIME_TO_FINALIZE = 3600 * 24;
  const COMMIT_COOLDOWN = TIME_TO_FINALIZE;

  const constructorArgs = [
    TIME_TO_FINALIZE,
    BLOCKS_PER_COMMIT_INTERVAL,
    COMMIT_COOLDOWN,
  ];

  const factory = await hre.ethers.getContractFactory('FuelChainState');

  const response = (await prepareUpgrade(contractDeployment.address, factory, {
    kind: 'uups',
    constructorArgs,
    getTxResponse: true,
    redeployImplementation: 'always',
  })) as TransactionResponse;

  const receipt = await hre.ethers.provider.getTransactionReceipt(
    response.hash
  );

  const implementation = receipt?.contractAddress ?? '';

  if (implementation === '')
    throw new Error(
      `Upgrade proposal failed for FuelChainState proxy (${contractDeployment.address})`
    );

  console.log(`FuelChainState upgraded to ${implementation}`);

  await save('FuelChainState', {
    address: contractDeployment.address,
    abi: [...FuelChainState.abi],
    implementation,
    transactionHash: response.hash,
    linkedData: {
      constructorArgs,
      factory: 'FuelChainState',
    },
  });
};

func.tags = ['prepare_upgrade_chain_state_time_finalize'];
func.id = 'prepare_upgrade_chain_state_time_finalize';
export default func;
