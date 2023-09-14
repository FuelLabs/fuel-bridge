import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import type {
  DeployedContractAddresses,
  DeployedContracts,
} from '../protocol/harness';
import { deployFuel, getContractAddresses } from '../protocol/harness';

import {
  isNetworkVerifiable,
  publishProxySourceVerification,
  publishImplementationSourceVerification,
  getNetworkName,
  saveDeploymentsFile,
  confirmationPrompt,
  waitForConfirmations,
} from './utils';

// Script to deploy the Fuel v2 system

// For localhost testing:
//    - Spin up a node (http://127.0.0.1:8545/ by default):
//        `npx hardhat node`
//    - Run this script, pointing to localhost:
//        `npx hardhat run --network localhost scripts/deploy.ts`

// You can then connect to localhost (ethers, metamask, etc.) and the Fuel system will be deployed there at the addresses given

const QUICK_DEPLOY = !!process.env.QUICK_DEPLOY;

async function main() {
  let deployer: Signer | undefined = undefined;

  if (process.env.DEPLOYER_KEY) {
    console.log('Deployer key found!');
    deployer = new ethers.Wallet(process.env.DEPLOYER_KEY, ethers.provider);
  }

  // Check that the node is up
  try {
    await ethers.provider.getBlockNumber();
  } catch (e) {
    throw new Error(
      `Failed to connect to RPC "${ethers.provider.connection.url}". Make sure your environment variables and configuration are correct.`
    );
  }

  // Get the current connected network
  const networkName = await getNetworkName();

  // Get confirmation
  let confirm = true;
  if (!QUICK_DEPLOY) {
    console.log('');
    confirm = await confirmationPrompt(
      `Are you sure you want to deploy ALL proxy and implementation contracts on "${networkName}" (Y/n)? `
    );
  }
  if (confirm) {
    // Setup Fuel
    let contracts: DeployedContracts;
    let deployments: DeployedContractAddresses;
    try {
      console.log('Deploying contracts...');
      contracts = await deployFuel(deployer);
      deployments = await getContractAddresses(contracts);
    } catch (e) {
      throw new Error(
        `Failed to deploy contracts. Make sure all configuration is correct and the proper permissions are in place.`
      );
    }
    const deployedBlock = await ethers.provider.getBlockNumber();

    // Emit the addresses of the deployed contracts
    console.log('Successfully deployed contracts!\n');
    Object.entries(deployments).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });

    // Write deployments to file
    await saveDeploymentsFile(deployments);

    // Confirm source verification/publishing
    if (!QUICK_DEPLOY && (await isNetworkVerifiable())) {
      console.log('');
      const confirmVerification = await confirmationPrompt(
        `Do you want to publish contract source code for verification (Y/n)? `
      );
      if (confirmVerification) {
        await waitForConfirmations(deployedBlock, 5);
        await publishProxySourceVerification(deployments);
        await publishImplementationSourceVerification(
          deployments,
          true,
          true,
          true
        );
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
