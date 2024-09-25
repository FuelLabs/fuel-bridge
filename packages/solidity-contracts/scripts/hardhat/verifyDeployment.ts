import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

task('verify-deployment', 'Verifies the deployed contract bytecode').setAction(
  async (taskArgs: any, hre: HardhatRuntimeEnvironment): Promise<void> => {
    const network = hre.network.name;
    console.log(
      `Verifying contract bytecode on ${network}:${hre.network.config.chainId}...`
    );

    const deployments = await hre.deployments.all();

    for (const [contractName, deployment] of Object.entries(deployments)) {
      console.log(`\nVerifying ${contractName} (${deployment.address}):`);

      try {
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

          const fetchedDeploymentTx =
            await localHardhat.ethers.provider.getTransaction(
              deployment.transactionHash
            )!;

          const actualInitCode = fetchedDeploymentTx?.data;
          if (deployment.linkedData.expectedInitCode === actualInitCode) {
            console.log(
              `✅ ${contractName} (${deployment.address}): Init Code verified sucessfully`
            );
          } else {
            console.log(
              `❌ ${contractName} (${deployment.address}): Init Code mismatch`
            );
            throw new Error('Init Code mismatch');
          }
        } else continue;
      } catch (error) {
        console.log(
          `❌ ${contractName} (${deployment.address}): Verification failed`
        );
        console.error(`   Error: ${error.message}`);
      }
    }
  }
);
