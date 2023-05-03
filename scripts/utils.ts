import hardhat, { ethers } from 'hardhat';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import readline from 'readline';
import { DeployedContractAddresses, getBlankAddresses } from '../protocol/harness';

// Script utils for deploy the Fuel v2 system

const DEPLOYMENTS_FILE = './deployments/deployments.*.json';

// Loads the deployment addresses for the currently connected network.
export async function loadDeploymentsFile(saveTemplateOnNotFound = true): Promise<DeployedContractAddresses> {
    let fileString: string;
    const networkName = await getNetworkName();
    const filename = DEPLOYMENTS_FILE.replace('*', networkName);
    try {
        fileString = await fs.readFile(filename, 'utf-8');
    } catch (e) {
        if (saveTemplateOnNotFound) {
            const deployments = getBlankAddresses();
            await fs.writeFile(filename, JSON.stringify(deployments, null, ' '), 'utf-8');
        }
        throw new Error(
            `Failed to read file "${filename}". Make sure the file "${filename}" is properly set and the contracts have been deployed before upgrading.`
        );
    }
    try {
        return JSON.parse(fileString);
    } catch (e) {
        throw new Error(`Failed to parse file "${filename}". Make sure it's properly formatted.`);
    }
}

// Saves the deployed addresses.
export async function saveDeploymentsFile(deployments: DeployedContractAddresses) {
    const networkName = await getNetworkName();
    const filename = DEPLOYMENTS_FILE.replace('*', networkName);
    await fs.writeFile(filename, JSON.stringify(deployments, null, ' '), 'utf-8');
}

// Gets the name of common EVM netwroks based on the connected networks reported chain ID.
export async function getNetworkName(): Promise<string> {
    try {
        //common list of networks and chain ids can be found here: https://chainlist.org/
        const network = await ethers.provider.getNetwork();
        if (network.chainId == 1) return 'mainnet';
        if (network.chainId == 5) return 'goerli';
        if (network.chainId == 31337) return 'local';
        return 'unknown';
    } catch (e) {
        throw new Error(`Failed to get network info from RPC "${ethers.provider.connection.url}".`);
    }
}

// Simple confirmation loop for CLI input.
export async function confirmationPrompt(prompt: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(function (resolve) {
        rl.question(prompt, async function (answer) {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'y');
        });
    });
}

// Publishes source code for verification of proxy contracts.
export async function publishProxySourceVerification(deployments: DeployedContractAddresses) {
    await verifyEtherscan('FuelChainState proxy', deployments.FuelChainState);
    await verifyEtherscan('FuelMessagePortal proxy', deployments.FuelMessagePortal);
    await verifyEtherscan('FuelERC20Gateway proxy', deployments.FuelERC20Gateway);

    await verifySourcifyFromEtherscan('FuelChainState proxy', deployments.FuelChainState);
    await verifySourcifyFromEtherscan('FuelMessagePortal proxy', deployments.FuelMessagePortal);
    await verifySourcifyFromEtherscan('FuelERC20Gateway proxy', deployments.FuelERC20Gateway);
}

// Publishes source code for verification of implementation contracts.
export async function publishImplementationSourceVerification(
    deployments: DeployedContractAddresses,
    publishFuelChainState: boolean,
    publishFuelMessagePortal: boolean,
    publishFuelERC20Gateway: boolean
) {
    if (publishFuelChainState) {
        await verifyEtherscan('FuelChainState implementation', deployments.FuelChainState_impl);
        await verifySourcifyFromEtherscan('FuelChainState implementation', deployments.FuelChainState_impl);
    }

    if (publishFuelMessagePortal) {
        await verifyEtherscan('FuelMessagePortal implementation', deployments.FuelMessagePortal_impl);
        await verifySourcifyFromEtherscan('FuelMessagePortal implementation', deployments.FuelMessagePortal_impl);
    }

    if (publishFuelERC20Gateway) {
        await verifyEtherscan('FuelERC20Gateway implementation', deployments.FuelERC20Gateway_impl);
        await verifySourcifyFromEtherscan('FuelERC20Gateway implementation', deployments.FuelERC20Gateway_impl);
    }
}

// Gets if the currently connected network is verifiable.
export async function isNetworkVerifiable(): Promise<boolean> {
    const networkName = await getNetworkName();
    return networkName === 'mainnet' || networkName === 'goerli';
}

// Waits for the given number of confirmations.
export async function waitForConfirmations(blockNum: number, confirmations: number) {
    let currentBlock = await ethers.provider.getBlockNumber();
    let diff = currentBlock - blockNum;
    if (diff < confirmations) {
        process.stdout.write(`Waiting for ${confirmations} block confirmations.`);
        while (currentBlock - blockNum < confirmations) {
            process.stdout.write('.');
            if (currentBlock - blockNum != diff) process.stdout.write(`${confirmations - diff - 1}`);
            diff = currentBlock - blockNum;

            await sleep(5000);
            currentBlock = await ethers.provider.getBlockNumber();
        }
        console.log(''); // eslint-disable-line no-console
    }
}

// Publishes source code verification on Etherscan.
async function verifyEtherscan(contractName: string, contractAddress: string) {
    try {
        console.log(`\nPublishing ${contractName} source verification on Etherscan...`); // eslint-disable-line no-console
        await hardhat.run('verify:verify', {
            address: contractAddress,
            constructorArguments: [],
        });
    } catch (e) {
        let message = 'An uknown issue occurred while verifying on Etherscan.';
        if (e instanceof Error) message = e.message;
        console.error(message); // eslint-disable-line no-console
    }
}

// Verifies source code on Sourcify from Etherscan.
async function verifySourcifyFromEtherscan(contractName: string, contractAddress: string) {
    try {
        console.log(`\nVerifying ${contractName} source on Sourcify from Etherscan...`); // eslint-disable-line no-console
        const network = await ethers.provider.getNetwork();
        const body = { address: contractAddress, chain: network.chainId };
        const response = await fetch('https://sourcify.dev/server/verify/etherscan', {
            method: 'post',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (data.result) {
            if (data.result.storageTimestamp) console.log('Contract source code already verified'); // eslint-disable-line no-console
            if (data.result.status == 'perfect') console.log('Contract source code perfectly verified!'); // eslint-disable-line no-console
            if (data.result.status == 'partial') console.log('Contract source code partially verified.'); // eslint-disable-line no-console
        }
    } catch (e) {
        let message = 'An uknown issue occurred while verifying on Sourcify.';
        if (e instanceof Error) message = e.message;
        console.error(message); // eslint-disable-line no-console
    }
}

// Sleep for the given number of milliseconds
function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
