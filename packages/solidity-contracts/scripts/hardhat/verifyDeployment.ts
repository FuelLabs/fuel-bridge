import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { config as dotEnvConfig } from 'dotenv';

dotEnvConfig();

task('verify-deployment', 'Verifies proxy upgrades').setAction(
  async (taskArgs: any, hre: HardhatRuntimeEnvironment): Promise<void> => {
    const network = hre.network.name;

    const {
      ethers,
      upgrades: { validateUpgrade },
    } = hre;

    console.log(
      `Verifying proxy upgrade on ${network}:${hre.network.config.chainId}...`
    );

    const deployments = await hre.deployments.all();

    for (const [contractName, deployment] of Object.entries(deployments)) {
      console.log(`\nVerifying ${contractName} (${deployment.address}):`);

      const implementation = await upgrades.erc1967.getImplementationAddress(
        deployment.address
      );

      // Only perform verification checks for a legitimate upgrade
      if (implementation != deployment.implementation) {
        const factory = (await ethers.getContractFactory(
          deployment.linkedData.factory
        )) as ethers.ContractFactory;

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

        const tx = await hre.ethers.provider.getTransaction(
          deployment.transactionHash!
        );

        if (expectedInitCode === tx?.data) {
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

        const expectedNewImplementationAddress = ethers.getCreateAddress({
          from: receipt?.from!,
          nonce: fetchedDeploymentTx?.nonce!,
        });

        if (receipt?.contractAddress === expectedNewImplementationAddress) {
          console.log(
            `✅ ${contractName} (${deployment.address}): New implementation deployment verified`
          );
        } else {
          console.log(
            `❌ ${contractName} (${deployment.address}):  New implementation deployment verification failed`
          );
          throw new Error('New implementation deployment verification failed');
        }
      } else continue;
    }
  }
);
