import { ethers } from 'hardhat';
import { upgradeFuel } from '../protocol/harness';
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
//    - Run the deploy script or create valid deployments.<local/goerli/mainnet>.json file
//        `npx hardhat run --network localhost scripts/deploy.ts`
//    - Run this script, pointing to localhost:
//        `npx hardhat run --network localhost scripts/upgrade.ts`

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
	const confirmUpgrade = await confirmationPrompt(
		`Are you sure you want to upgrade ALL contracts on "${networkName}" (Y/n)? `
	);
	if (confirmUpgrade) {
		// Upgrade Fuel
		try {
			console.log('Upgrading contracts...'); // eslint-disable-line no-console
			await upgradeFuel(deployments);
		} catch (e) {
			throw new Error(
				`Failed to deploy contracts. Make sure all configuration is correct and the proper permissions are in place.`
			);
		}
		const deployedBlock = await ethers.provider.getBlockNumber();

		// Emit the addresses of the deployed contracts
		console.log('Successfully upgraded contracts!\n'); // eslint-disable-line no-console
		Object.entries(deployments).forEach(([key, value]) => {
			console.log(`${key}: ${value}`); // eslint-disable-next-line no-console
		});

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
				await publishImplementationSourceVerification(deployments, true, true, true);
			}
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error); // eslint-disable-line no-console
		process.exit(1);
	});
