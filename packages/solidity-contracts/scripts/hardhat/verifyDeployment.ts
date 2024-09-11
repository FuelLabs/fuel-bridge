import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import fs from 'fs';
import path from 'path';

interface Deployment {
  contractName: string;
  address: string;
  args: any[];
  isProxy?: boolean;
  isImplementation?: boolean;
  proxyAddress?: string;
}

task('verify-deployment', 'Verifies the deployed contract bytecode').setAction(
  async (taskArgs: any, hre: HardhatRuntimeEnvironment): Promise<void> => {
    const network = hre.network.name;
    console.log(
      `Verifying contract bytecode on ${network}:${hre.network.config.chainId}...`
    );

    const deploymentsFile = path.join(`deployments/${network}/${network}.json`);
    if (!fs.existsSync(deploymentsFile)) {
      console.error(`Deployments file not found: ${deploymentsFile}`);
      return;
    }

    const deployments: Deployment[] = JSON.parse(
      fs.readFileSync(deploymentsFile, 'utf8')
    );

    for (const deployment of deployments) {
      console.log(
        `\nVerifying ${deployment.contractName} (${deployment.address}):`
      );

      try {
        console.log('  Reading contract artifact...');
        const artifactPath = path.join(
          `artifacts/contracts/${deployment.contractName}.sol/${deployment.contractName}.json`
        );

        if (!fs.existsSync(artifactPath)) {
          console.log('  Artifact not found. Compiling contracts...');
          await hre.run('compile');

          if (!fs.existsSync(artifactPath)) {
            throw new Error(
              `Artifact not found even after compilation: ${artifactPath}`
            );
          }
        }

        console.log('--- Fetching deployed bytecode...');
        let deployedBytecode: string;
        if (deployment.isProxy) {
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
          deployment.contractName
        );
        let localAddress: string;
        if (deployment.isProxy) {
          const localContract = await localHardhat.upgrades.deployProxy(
            ContractFactory,
            [],
            { kind: 'uups' }
          );
          await localContract.deployed();
          localAddress = await localContract.getAddress();
        } else if (deployment.isImplementation) {
          console.log('--- Validating Upgrade...');
          await localHardhat.upgrades.validateUpgrade(
            deployment.proxyAddress as string,
            ContractFactory,
            { kind: 'uups' }
          );

          console.log('--- Upgrade success');
          localAddress = deployment.address;
        } else {
          const localContract = await ContractFactory.deploy(
            ...deployment.args
          );
          await localContract.deployed();
          localAddress = await localContract.getAddress();
        }

        console.log('--- Fetching local deployment bytecode...');
        let localBytecode: string;
        if (deployment.isProxy) {
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
            `✅ ${deployment.contractName} (${deployment.address}): Bytecode verified successfully`
          );
        } else {
          console.log(
            `❌ ${deployment.contractName} (${deployment.address}): Bytecode mismatch`
          );
          throw new Error('Bytecode mismatch');
        }
      } catch (error) {
        console.log(
          `❌ ${deployment.contractName} (${deployment.address}): Verification failed`
        );
        console.error(`   Error: ${error.message}`);
      }
    }
  }
);
