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
	console.log(''); // eslint-disable-line no-console
	const confirmFuelSidechainConsensus = await confirmationPrompt(
		`Are you sure you want to deploy the implementation for FuelSidechainConsensus on "${networkName}" (Y/n)? `
	);
	const confirmFuelMessagePortal = await confirmationPrompt(
		`Are you sure you want to deploy the implementation for FuelMessagePortal on "${networkName}" (Y/n)? `
	);
	const confirmL1ERC20Gateway = await confirmationPrompt(
		`Are you sure you want to deploy the implementation for L1ERC20Gateway on "${networkName}" (Y/n)? `
	);

	// Deploy FuelSidechainConsensus implementation
	let fuelSidechainConsensusAddress = null;
	if (confirmFuelSidechainConsensus) {
		console.log('Deploying FuelSidechainConsensus implementation...'); // eslint-disable-line no-console
		const FuelSidechainConsensus = await ethers.getContractFactory('FuelSidechainConsensus');
		fuelSidechainConsensusAddress = (await upgrades.deployImplementation(FuelSidechainConsensus)).toString();
	}

	// Deploy FuelMessagePortal implementation
	let fuelMessagePortalAddress = null;
	if (confirmFuelMessagePortal) {
		console.log('Deploying FuelMessagePortal implementation...'); // eslint-disable-line no-console
		const FuelMessagePortal = await ethers.getContractFactory('FuelMessagePortal');
		fuelMessagePortalAddress = (await upgrades.deployImplementation(FuelMessagePortal)).toString();
	}

	// Deploy L1ERC20Gateway implementation
	let l1ERC20GatewayAddress = null;
	if (confirmL1ERC20Gateway) {
		console.log('Deploying L1ERC20Gateway implementation...'); // eslint-disable-line no-console
		const L1ERC20Gateway = await ethers.getContractFactory('L1ERC20Gateway');
		l1ERC20GatewayAddress = (await upgrades.deployImplementation(L1ERC20Gateway)).toString();
	}

	// Remember the current block so we can wait for confirmation later
	const deployedBlock = await ethers.provider.getBlockNumber();

	// Emit the addresses of the deployed contracts
	console.log('Successfully deployed contract implementations!\n'); // eslint-disable-line no-console
	if (fuelSidechainConsensusAddress) {
		console.log(`FuelSidechainConsensus: ${fuelSidechainConsensusAddress}`); // eslint-disable-line no-console
		deployments.FuelSidechainConsensus_impl = fuelSidechainConsensusAddress;
	}
	if (fuelMessagePortalAddress) {
		console.log(`FuelMessagePortal: ${fuelMessagePortalAddress}`); // eslint-disable-line no-console
		deployments.FuelMessagePortal_impl = fuelMessagePortalAddress;
	}
	if (l1ERC20GatewayAddress) {
		console.log(`L1ERC20Gateway: ${l1ERC20GatewayAddress}`); // eslint-disable-line no-console
		deployments.L1ERC20Gateway_impl = l1ERC20GatewayAddress;
	}

	// Write deployments to file
	await saveDeploymentsFile(deployments);

	// Confirm source verification/publishing
	if (await isNetworkVerifiable()) {
		console.log(''); // eslint-disable-line no-console
		const confirmVerification = await confirmationPrompt(
			`Do you want to publish contract source code for verification (Y/n)? `
		);
		if (confirmVerification) {
			await waitForConfirmations(deployedBlock, 5);
			await publishImplementationSourceVerification(
				deployments,
				confirmFuelSidechainConsensus,
				confirmFuelMessagePortal,
				confirmL1ERC20Gateway
			);
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error); // eslint-disable-line no-console
		process.exit(1);
	});
