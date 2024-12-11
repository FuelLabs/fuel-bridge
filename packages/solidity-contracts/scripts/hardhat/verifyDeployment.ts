import { isAddress, type ContractFactory } from 'ethers';
import { writeFileSync } from 'fs';
import { task } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

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

    const verificationPayload = [];

    for (const [contractName, deployment] of Object.entries(deployments)) {
      console.log(`\nVerifying ${contractName} (${deployment.address}):`);

      // Edge case: we are also holding Fuel network artifacts (Fuell2BridgeId)
      if (!isAddress(deployment.address)) {
        continue;
      }

      // Skip if not a proxy
      if (!isAddress(deployment.implementation)) {
        continue;
      }

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
      )) as ContractFactory; // Typing bug in `getContractFactory`

      console.log(
        `--- Validating the upgrade to ${deployment.implementation} implementation...`
      );

      await validateUpgrade(
        deployment.address as string,
        factory,
        {
          kind: 'uups',
          constructorArgs: deployment.linkedData.constructorArgs,
        } as any // Typing bug in `validateUpgrade`
      );

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

      const txHash = fetchedDeploymentTx?.hash ?? '';
      if (txHash === '') throw new Error('Transaction hash not found');

      const receipt = await ethers.provider.getTransactionReceipt(txHash);

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

      console.log(
        `✅ ${contractName} (${deployment.address}): Confirmed viability to upgrade to ${deployment.implementation}`
      );

      // update payload for each upgrade
      verificationPayload.push({
        bytecode: expectedInitCode,
        address: deployment.implementation,
        txHash: fetchedDeploymentTx.hash,
      });
    }

    writeFileSync('verification.json', JSON.stringify(verificationPayload));
  }
);
