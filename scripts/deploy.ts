import { Contract, utils } from 'ethers';
import { setupFuel } from '../protocol/harness';

// Script to deploy the Fuel v2 system

// For localhost testing:
//    - Spin up a node (http://127.0.0.1:8545/ by default):
//        `npx hardhat node`
//    - Run this script, pointing to localhost:
//        `npx hardhat run --network localhost scripts/deploy.ts`

// You can then connect to localhost (ethers, metamask, etc.) and the Fuel system will be deployed there at the addresses given

async function main() {
	// Setup Fuel.
	const env = await setupFuel();

	// Emit the addresses of the deployed contracts
	Object.entries(env).forEach(([key, value]) => {
		if (value instanceof Contract) {
			console.log(`${key}: ${value.address}`); // eslint-disable-line no-console
		}
	});
	console.log('Initial token amount: ', utils.formatEther(env.initialTokenAmount)); // eslint-disable-line no-console
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error); // eslint-disable-line no-console
		process.exit(1);
	});
