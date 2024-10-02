import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { config as dotEnvConfig } from 'dotenv';
import { ContractFactory } from 'ethers';
dotEnvConfig();

task('verify-deployment', 'Verifies proxy upgrades').setAction(
  async (taskArgs: any, hre: HardhatRuntimeEnvironment): Promise<void> => {
    const network = hre.network.name;

    const {
      ethers,
      upgrades: { validateUpgrade, erc1967 },
    } = hre;

    console.log(
      `Verifying proxy upgrade on ${network}:${hre.network.config.chainId}...`
    );

    const deployments = await hre.deployments.all();

    for (const [contractName, deployment] of Object.entries(deployments)) {
      console.log(`\nVerifying ${contractName} (${deployment.address}):`);

      const currentImplementation = await erc1967.getImplementationAddress(
        deployment.address
      );

      // Only perform verification checks for a legitimate upgrade
      if (
        currentImplementation.toLowerCase() ===
        deployment.implementation!.toLowerCase()
      )
        continue;

      const factory = (await ethers.getContractFactory(
        deployment.linkedData.factory
      )) as ContractFactory;

      console.log(
        `--- Validating the upgrade to ${deployment.implementation} implementation...`
      );

      await validateUpgrade(deployment.address as string, factory, {
        kind: 'uups',
        constructorArgs: deployment.linkedData.constructorArgs,
      });

      console.log('--- Upgrade Validated...');

      console.log(
        '--- Comparing expected init code with actual init code on-chain...'
      );

      const { data: expectedInitCode } = await factory.getDeployTransaction(
        ...deployment.linkedData.constructorArgs
      );

      const fetchedDeploymentTx = await ethers.provider.getTransaction(
        deployment.transactionHash!
      )!;

      const receipt = await ethers.provider.getTransactionReceipt(
        fetchedDeploymentTx?.hash!
      );

      // checking for null/undefined value too
      if (
        fetchedDeploymentTx?.data &&
        expectedInitCode === fetchedDeploymentTx.data
      ) {
        console.log(
          `✅ ${contractName} (${deployment.address}): Init Code verified successfully`
        );
      } else {
        console.log(
          `❌ ${contractName} (${deployment.address}): Init Code mismatch`
        );
        throw new Error('Init Code mismatch');
      }

      console.log(
        '--- Check if the new implementation deployment resulted in deploying that implementation address...'
      );

      // checking for null/undefined value too
      if (
        receipt?.contractAddress &&
        receipt.contractAddress === deployment.implementation
      ) {
        console.log(
          `✅ ${contractName} (${deployment.address}): New implementation deployment verified`
        );
      } else {
        console.log(
          `❌ ${contractName} (${deployment.address}):  New implementation deployment verification failed`
        );
        throw new Error('New implementation deployment verification failed');
      }
    }
  }
);