import { HardhatUserConfig } from 'hardhat/types';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-typechain';
import 'hardhat-deploy';
import 'solidity-coverage';
import 'hardhat-gas-reporter';
import { config as dotEnvConfig } from 'dotenv';

dotEnvConfig();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

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
		}
	},
	etherscan: {
		apiKey: ETHERSCAN_API_KEY,
	},
	paths: {
	  deploy: './deploy',
	  deployments: './deployments',
	},
	namedAccounts: {
	  deployer: {
		default: 0,
	  },
	},
};

if (
  process.env.CONTRACTS_TARGET_NETWORK &&
  process.env.CONTRACTS_DEPLOYER_KEY &&
  process.env.CONTRACTS_RPC_URL
) {
  config.networks = config.networks || {};
  config.networks[process.env.CONTRACTS_TARGET_NETWORK] = {
    accounts: [process.env.CONTRACTS_DEPLOYER_KEY],
    url: process.env.CONTRACTS_RPC_URL,
    live: true,
    saveDeployments: true,
    tags: [process.env.CONTRACTS_TARGET_NETWORK],
  }
}

export default config;
