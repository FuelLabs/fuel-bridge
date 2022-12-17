import { HardhatUserConfig } from 'hardhat/types';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import '@openzeppelin/hardhat-upgrades';
import 'hardhat-typechain';
import 'solidity-coverage';
import 'hardhat-gas-reporter';
import { config as dotEnvConfig } from 'dotenv';

dotEnvConfig();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const CONTRACTS_RPC_URL = process.env.CONTRACTS_RPC_URL || '';
const CONTRACTS_DEPLOYER_KEY = process.env.CONTRACTS_DEPLOYER_KEY || '';

const config: HardhatUserConfig = {
	defaultNetwork: 'hardhat',
	solidity: {
		compilers: [
			{
				version: '0.8.9',
				settings: {
					optimizer: {
						enabled: true,
						runs: 10000,
					},
				},
			},
		],
	},
	mocha: {
		timeout: 180_000,
	},
	networks: {
		hardhat: {
			accounts: {
				count: 128,
			},
		},
		localhost: {
			url: 'http://127.0.0.1:8545/',
		},
		custom: {
			url: 'http://127.0.0.1:8545/',
		},
	},
	etherscan: {
		apiKey: ETHERSCAN_API_KEY,
	},
};

// Override network configuration with environment variables
if (CONTRACTS_RPC_URL && CONTRACTS_DEPLOYER_KEY && config.networks && config.networks.custom) {
	config.networks.custom = {
		accounts: [CONTRACTS_DEPLOYER_KEY],
		url: CONTRACTS_RPC_URL,
		live: true,
	};
	if (process.env.CONTRACTS_GAS_PRICE) config.networks.custom.gasPrice = parseInt(process.env.CONTRACTS_GAS_PRICE);
}

export default config;
