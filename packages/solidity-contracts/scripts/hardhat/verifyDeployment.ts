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
        let deployedBytecode: string;

        if (!deployment.linkedData.isProxy) {
          deployedBytecode = await hre.ethers.provider.getCode(
            deployment.address
          );
        } else continue;

        console.log('--- Creating local Hardhat network...');
        const localHardhat = require('hardhat');
        await localHardhat.run('compile');

        const ContractFactory = await localHardhat.ethers.getContractFactory(
          deployment.linkedData.factory
        );

        if (!deployment.linkedData.isProxy) {
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
        } else continue;

        console.log('--- Fetching local deployment bytecode...');
        let localBytecode: string;
        if (!deployment.linkedData.isProxy) {
          localBytecode = await (
            await hre.artifacts.readArtifact(deployment.linkedData.factory)
          ).bytecode;
        } else continue;

        console.log('--- Comparing bytecodes...');
        console.log(
          '--- Deployed bytecode: ',
          hre.ethers.keccak256(deployedBytecode)
        );
        console.log(
          '--- Local bytecode: ',
          hre.ethers.keccak256(localBytecode)
        );

        if (
          hre.ethers.keccak256(deployedBytecode) ===
          hre.ethers.keccak256(localBytecode)
        ) {
          console.log(
            `✅ ${contractName} (${deployment.address}): Bytecode verified successfully`
          );
        } else {
          console.log(
            `❌ ${contractName} (${deployment.address}): Bytecode mismatch`
          );
          throw new Error('Bytecode mismatch');
        }
      } catch (error) {
        console.log(
          `❌ ${contractName} (${deployment.address}): Verification failed`
        );
        console.error(`   Error: ${error.message}`);
      }
    }
  }
);
