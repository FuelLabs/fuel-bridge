import { ethers, upgrades } from 'hardhat';

import {
  isNetworkVerifiable,
  publishImplementationSourceVerification,
  getNetworkName,
  loadDeploymentsFile,
  saveDeploymentsFile,
  confirmationPrompt,
  waitForConfirmations,
} from './utils';

// Script to upgrade the Fuel v2 system contracts

// For localhost testing:
//    - Spin up a node (http://127.0.0.1:8545/ by default):
//        `npx hardhat node`
//    - Run this script, pointing to localhost:
//        `npx hardhat run --network localhost scripts/deployImplementation.ts`

// You can then connect to localhost (ethers, metamask, etc.) and the Fuel system will be deployed there at the addresses given

async function main() {
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

  // Read existing deployments file
  const deployments = await loadDeploymentsFile();

  // Get confirmation
  console.log('');
  const confirmFuelChainState = await confirmationPrompt(
    `Are you sure you want to deploy the implementation for FuelChainState on "${networkName}" (Y/n)? `
  );
  const confirmFuelMessagePortal = await confirmationPrompt(
    `Are you sure you want to deploy the implementation for FuelMessagePortal on "${networkName}" (Y/n)? `
  );
  const confirmFuelERC20Gateway = await confirmationPrompt(
    `Are you sure you want to deploy the implementation for FuelERC20Gateway on "${networkName}" (Y/n)? `
  );

  // Deploy FuelChainState implementation
  let fuelChainStateAddress = null;
  if (confirmFuelChainState) {
    console.log('Deploying FuelChainState implementation...');
    const FuelChainState = await ethers.getContractFactory('FuelChainState');
    fuelChainStateAddress = (
      await upgrades.deployImplementation(FuelChainState)
    ).toString();
  }

  // Deploy FuelMessagePortal implementation
  let fuelMessagePortalAddress = null;
  if (confirmFuelMessagePortal) {
    console.log('Deploying FuelMessagePortal implementation...');
    const FuelMessagePortal = await ethers.getContractFactory(
      'FuelMessagePortal'
    );
    fuelMessagePortalAddress = (
      await upgrades.deployImplementation(FuelMessagePortal)
    ).toString();
  }

  // Deploy FuelERC20Gateway implementation
  let fuelERC20GatewayAddress = null;
  if (confirmFuelERC20Gateway) {
    console.log('Deploying FuelERC20Gateway implementation...');
    const FuelERC20Gateway = await ethers.getContractFactory(
      'FuelERC20Gateway'
    );
    fuelERC20GatewayAddress = (
      await upgrades.deployImplementation(FuelERC20Gateway)
    ).toString();
  }

  // Remember the current block so we can wait for confirmation later
  const deployedBlock = await ethers.provider.getBlockNumber();

  // Emit the addresses of the deployed contracts
  console.log('Successfully deployed contract implementations!\n');
  if (fuelChainStateAddress) {
    console.log(`FuelChainState: ${fuelChainStateAddress}`);
    deployments.FuelChainState_impl = fuelChainStateAddress;
  }
  if (fuelMessagePortalAddress) {
    console.log(`FuelMessagePortal: ${fuelMessagePortalAddress}`);
    deployments.FuelMessagePortal_impl = fuelMessagePortalAddress;
  }
  if (fuelERC20GatewayAddress) {
    console.log(`FuelERC20Gateway: ${fuelERC20GatewayAddress}`);
    deployments.FuelERC20Gateway_impl = fuelERC20GatewayAddress;
  }

  // Write deployments to file
  await saveDeploymentsFile(deployments);

  // Confirm source verification/publishing
  if (await isNetworkVerifiable()) {
    console.log('');
    const confirmVerification = await confirmationPrompt(
      `Do you want to publish contract source code for verification (Y/n)? `
    );
    if (confirmVerification) {
      await waitForConfirmations(deployedBlock, 5);
      await publishImplementationSourceVerification(
        deployments,
        confirmFuelChainState,
        confirmFuelMessagePortal,
        confirmFuelERC20Gateway
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
