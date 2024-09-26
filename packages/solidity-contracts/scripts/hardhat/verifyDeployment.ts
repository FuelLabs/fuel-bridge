import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { config as dotEnvConfig } from 'dotenv';

dotEnvConfig();

task('verify-deployment', 'Verifies the deployed contract bytecode').setAction(
  async (taskArgs: any, hre: HardhatRuntimeEnvironment): Promise<void> => {
    const network = hre.network.name;
    console.log(
      `Verifying contract bytecode on ${network}:${hre.network.config.chainId}...`
    );

    const deployments = await hre.deployments.all();

    for (const [contractName, deployment] of Object.entries(deployments)) {
      console.log(`\nVerifying ${contractName} (${deployment.address}):`);

      console.log('--- Fetching deployed bytecode...');

      if (!deployment.linkedData.isProxy) {
        console.log('--- Creating local Hardhat network...');
        const localHardhat = require('hardhat');
        await localHardhat.run('compile');

        const ContractFactory = await localHardhat.ethers.getContractFactory(
          deployment.linkedData.factory
        );

        console.log('--- Validating Upgrade...');
        await localHardhat.upgrades.validateUpgrade(
          deployment.address as string,
          ContractFactory,
          {
            kind: 'uups',
            constructorArgs: deployment.linkedData.constructorArgs,
          }
        );

        console.log('--- Upgrade Validated...');

        console.log(
          '--- Comparing expected init code with actual init code on-chain...'
        );

        const { data: expectedInitCode } =
          await ContractFactory.getDeployTransaction(
            ...deployment.linkedData.constructorArgs
          );

        const fetchedDeploymentTx =
          await localHardhat.ethers.provider.getTransaction(
            deployment.transactionHash
          )!;

        const reciept =
          await localHardhat.ethers.provider.getTransactionReceipt(
            fetchedDeploymentTx?.hash
          );

        const tx = await hre.ethers.provider.getTransaction(
          deployment.transactionHash!
        );

        if (expectedInitCode === tx?.data) {
          console.log(
            `✅ ${contractName} (${deployment.address}): Init Code verified sucessfully`
          );
        } else {
          console.log(
            `❌ ${contractName} (${deployment.address}): Init Code mismatch`
          );
          throw new Error('Init Code mismatch');
        }

        console.log(
          '--- Check the new implementation deployment resulted in deploying that implementation addresss...'
        );

        if (
          reciept?.contractAddress === deployment.linkedData.newImplementation
        ) {
          console.log(
            `✅ ${contractName} (${deployment.address}): new implementation deployment verified`
          );
        } else {
          console.log(
            `❌ ${contractName} (${deployment.address}):  new implementation deployment verification failed`
          );
          throw new Error('Init Code mismatch');
        }
      } else continue;
    }
  }
);
