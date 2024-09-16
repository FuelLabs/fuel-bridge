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
        if (deployment.linkedData.isProxy) {
          const implementationAddress =
            await hre.upgrades.erc1967.getImplementationAddress(
              deployment.address
            );
          console.log('implementationAddress:', implementationAddress);
          deployedBytecode = await hre.ethers.provider.getCode(
            implementationAddress
          );
        } else {
          deployedBytecode = await hre.ethers.provider.getCode(
            deployment.address
          );
        }

        console.log('--- Creating local Hardhat network...');
        const localHardhat = require('hardhat');
        await localHardhat.run('compile');

        console.log('--- Deploying contract locally...');
        const ContractFactory = await localHardhat.ethers.getContractFactory(
          contractName
        );
        let localAddress: string;
        if (deployment.linkedData.isProxy) {
          const localContract = await localHardhat.upgrades.deployProxy(
            ContractFactory,
            deployment.linkedData.initArgs,
            {
              kind: 'uups',
              initializer:
                contractName == 'FuelMessagePortalV3'
                  ? 'initializerV3'
                  : 'initialize',
              constructorArgs: deployment.linkedData.constructorArgs,
            }
          );
          await localContract.waitForDeployment();
          localAddress = await localContract.getAddress();
        } else if (deployment.linkedData.isImplementation) {
          console.log('--- Validating Upgrade...');
          await localHardhat.upgrades.validateUpgrade(
            deployment.linkedData.proxyAddress as string,
            ContractFactory,
            {
              kind: 'uups',
              constructorArgs: deployment.linkedData.constructorArgs,
            }
          );

          console.log('--- Upgrade success');
          localAddress = deployment.address;
        } else {
          const localContract = await ContractFactory.deploy(
            ...deployment.linkedData.constructorArgs
          );
          await localContract.deployed();
          localAddress = await localContract.getAddress();
        }

        console.log('--- Fetching local deployment bytecode...');
        let localBytecode: string;
        if (deployment.linkedData.isProxy) {
          const localImplementationAddress =
            await localHardhat.upgrades.erc1967.getImplementationAddress(
              localAddress
            );
          localBytecode = await localHardhat.ethers.provider.getCode(
            localImplementationAddress
          );
        } else {
          localBytecode = await localHardhat.ethers.provider.getCode(
            localAddress
          );
        }

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
