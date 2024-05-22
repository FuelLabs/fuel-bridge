import { config as dotEnvConfig } from 'dotenv';
import type { HardhatUserConfig } from 'hardhat/types';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-network-helpers';
import '@nomicfoundation/hardhat-verify';
import '@nomicfoundation/hardhat-chai-matchers';
import '@typechain/hardhat';
import '@openzeppelin/hardhat-upgrades';
import 'hardhat-deploy';
import 'solidity-coverage';
import './scripts/hardhat';

dotEnvConfig();

const CONTRACTS_DEPLOYER_KEY = process.env.CONTRACTS_DEPLOYER_KEY || '';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const INFURA_API_KEY = process.env.INFURA_API_KEY || '';
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';

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
      deploy: ['deploy/hardhat'],
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
    },
    beta5: {
      url: RPC_URL,
      accounts: CONTRACTS_DEPLOYER_KEY
        ? [CONTRACTS_DEPLOYER_KEY]
        : {
            mnemonic:
              'test test test test test test test test test test test junk',
          },
      deploy: ['deploy/beta5'],
      chainId: 11155111,
    },
    beta5devnet: {
      url: RPC_URL,
      accounts: CONTRACTS_DEPLOYER_KEY
        ? [CONTRACTS_DEPLOYER_KEY]
        : {
            mnemonic:
              'test test test test test test test test test test test junk',
          },
      deploy: ['deploy/beta5devnet'],
      chainId: 11155111,
    },
    devnet: {
      url: RPC_URL,
      accounts: CONTRACTS_DEPLOYER_KEY
        ? [CONTRACTS_DEPLOYER_KEY]
        : {
            mnemonic:
              'test test test test test test test test test test test junk',
          },
      deploy: ['deploy/devnet'],
      chainId: 11155111,
    },
    testnet: {
      url: RPC_URL,
      accounts: CONTRACTS_DEPLOYER_KEY
        ? [CONTRACTS_DEPLOYER_KEY]
        : {
            mnemonic:
              'test test test test test test test test test test test junk',
          },
      deploy: ['deploy/testnet'],
      chainId: 11155111,
    },
  },
  typechain: {
    outDir: 'typechain',
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
