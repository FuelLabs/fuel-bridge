import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory as FuelChainState } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    upgrades: { prepareUpgrade },
    deployments: { save },
  } = hre;

  const contractDeployment = await hre.deployments.get('FuelChainState');

  const contract = await hre.ethers.getContractFactory('FuelChainState');

  const implementationAddress = await prepareUpgrade(
    contractDeployment.address,
    contract,
    {
      kind: 'uups',
      constructorArgs: contractDeployment.linkedData.constructorArgs,
    }
  );

  await save('FuelChainState', {
    address: contractDeployment.address,
    abi: [...FuelChainState.abi],
    implementation: contractDeployment.implementation,
    linkedData: {
      constructorArgs: contractDeployment.linkedData.constructorArgs,
      initArgs: contractDeployment.linkedData.initArgs,
      isProxy: false,
      newImplementation: implementationAddress.toString(),
    },
  });
};

func.tags = ['prepareUpgrade_chain_state'];
func.id = 'prepareUpgrade_chain_state';
export default func;
