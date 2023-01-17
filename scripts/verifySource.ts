import { ethers } from 'hardhat';
import {
    loadDeploymentsFile,
    getNetworkName,
    confirmationPrompt,
    publishProxySourceVerification,
    publishImplementationSourceVerification,
} from './utils';

// Script to publish source code for verification of the Fuel v2 system contracts

async function main() {
    // Check that the node is up
    try {
        await ethers.provider.getBlockNumber();
    } catch (e) {
        throw new Error(
            `Failed to connect to RPC "${ethers.provider.connection.url}". Make sure your environment variables and configuration are correct.`
        );
    }

    // Read existing deployments file
    const deployments = await loadDeploymentsFile();

    // Get the current connected network
    const networkName = await getNetworkName();

    // Get confirmation for proxy contracts
    console.log(''); // eslint-disable-line no-console
    const confirmProxies = await confirmationPrompt(
        `Are you sure you want to publish the verification of source code for ALL contract proxies on "${networkName}" (Y/n)? `
    );

    // Verify contract implementations
    if (confirmProxies) await publishProxySourceVerification(deployments);

    // Get confirmation for implementation contracts
    console.log(''); // eslint-disable-line no-console
    const confirmFuelChainConsensusImpl = await confirmationPrompt(
        `Are you sure you want to publish the verification of source code for the FuelChainConsensus implementation on "${networkName}" (Y/n)? `
    );
    const confirmFuelMessagePortalImpl = await confirmationPrompt(
        `Are you sure you want to publish the verification of source code for the FuelMessagePortal implementation on "${networkName}" (Y/n)? `
    );
    const confirmFuelERC20GatewayImpl = await confirmationPrompt(
        `Are you sure you want to publish the verification of source code for the FuelERC20Gateway implementation on "${networkName}" (Y/n)? `
    );

    // Verify contract implementations
    await publishImplementationSourceVerification(
        deployments,
        confirmFuelChainConsensusImpl,
        confirmFuelMessagePortalImpl,
        confirmFuelERC20GatewayImpl
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error); // eslint-disable-line no-console
        process.exit(1);
    });
