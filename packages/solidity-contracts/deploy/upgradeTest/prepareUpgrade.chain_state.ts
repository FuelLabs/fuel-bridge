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

  const deployment = await factory.deploy(
    ...contractDeployment.linkedData.constructorArgs as [number, number, number]
  );

  const deploymentTx = deployment.deploymentTransaction();

  // const fetchedDeploymentTx = await ethers.provider.getTransaction(
  //   deploymentTx?.hash!
  // )!;

  // const data = fetchedDeploymentTx?.data;

  // console.log(expectedInitCode)

  // console.log('Init code === tx.data', expectedInitCode === data);

  // const nextAddr = getCreateAddress({
  //   from: deployer.address,
  //   nonce: await ethers.provider.getTransactionCount(deployer),
  // });

  // const emptyCode = await ethers.provider.getCode(nextAddr);
  // console.log('Address is not deployed: ', emptyCode === '0x');

  const implementationAddress = await prepareUpgrade(
    contractDeployment.address,
    factory,
    {
      kind: 'uups',
      constructorArgs: contractDeployment.linkedData.constructorArgs,
    }
  );

  // console.log('Init code === Upgrade data', response.data === expectedInitCode);

  // const deployedCode = await ethers.provider.getCode(nextAddr);
  // console.log('Address was correctly predicted', deployedCode.length > 2);
  // console.log('New implementation address', nextAddr);

  await save('FuelChainState', {
    address: contractDeployment.address,
    abi: [...FuelChainState.abi],
    implementation: contractDeployment.implementation,
    transactionHash: deploymentTx?.hash,
    linkedData: {
      constructorArgs: contractDeployment.linkedData.constructorArgs,
      factory: 'FuelChainState',
      initArgs: contractDeployment.linkedData.initArgs,
      isProxy: false,
      newImplementation: implementationAddress.toString(),
    },
  });
};

func.tags = ['prepareUpgrade_chain_state'];
func.id = 'prepareUpgrade_chain_state';
export default func;
