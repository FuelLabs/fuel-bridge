import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory as FuelChainState } from '../../typechain';
import { TransactionResponse, getCreateAddress } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { prepareUpgrade },
    deployments: { save },
  } = hre;

  const [deployer] = await ethers.getSigners();
  const contractDeployment = await hre.deployments.get('FuelChainState');

  const factory = await hre.ethers.getContractFactory('FuelChainState');

  const [arg1, arg2, arg3] = contractDeployment.linkedData.constructorArgs!;

  const deployment = await factory.deploy(arg1, arg2, arg3);
  const { data: expectedInitCode } = await factory.getDeployTransaction(
    arg1,
    arg2,
    arg3
  );

  const deploymentTx = deployment.deploymentTransaction();

  const fetchedDeploymentTx = await ethers.provider.getTransaction(
    deploymentTx?.hash!
  )!;

  const data = fetchedDeploymentTx?.data;

  console.log('Init code === tx.data', expectedInitCode === data);

  const nextAddr = getCreateAddress({
    from: deployer.address,
    nonce: await ethers.provider.getTransactionCount(deployer),
  });

  const emptyCode = await ethers.provider.getCode(nextAddr);
  console.log('Address is not deployed: ', emptyCode === '0x');

  const response = (await prepareUpgrade(contractDeployment.address, factory, {
    kind: 'uups',
    constructorArgs: contractDeployment.linkedData.constructorArgs,
    getTxResponse: true,
    redeployImplementation: 'always',
  })) as TransactionResponse;

  console.log('Init code === Upgrade data', response.data === expectedInitCode);

  const deployedCode = await ethers.provider.getCode(nextAddr);
  console.log('Address was correctly predicted', deployedCode.length > 2);
  console.log('New implementation address', nextAddr);

  await save('FuelChainState', {
    address: contractDeployment.address,
    abi: [...FuelChainState.abi],
    implementation: contractDeployment.implementation,

    linkedData: {
      constructorArgs: contractDeployment.linkedData.constructorArgs,
      factory: 'FuelChainState',
      initArgs: contractDeployment.linkedData.initArgs,
      isProxy: false,
      newImplementation: nextAddr,
    },
  });
};

func.tags = ['prepareUpgrade_chain_state'];
func.id = 'prepareUpgrade_chain_state';
export default func;
