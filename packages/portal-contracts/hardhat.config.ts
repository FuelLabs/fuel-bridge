import { HardhatUserConfig } from 'hardhat/types';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import '@openzeppelin/hardhat-upgrades';
import 'hardhat-typechain';
import 'solidity-coverage';
import 'hardhat-gas-reporter';
import { config as dotEnvConfig } from 'dotenv';

dotEnvConfig();

const CONTRACTS_DEPLOYER_KEY = process.env.CONTRACTS_DEPLOYER_KEY || '';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const INFURA_API_KEY = process.env.INFURA_API_KEY || '';

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
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: CONTRACTS_DEPLOYER_KEY ? [CONTRACTS_DEPLOYER_KEY] : [],
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
