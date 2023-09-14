import type { HardhatUserConfig } from 'hardhat/types';
import '@nomiclabs/hardhat-etherscan';
import '@openzeppelin/hardhat-upgrades';
import 'hardhat-typechain';

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const LOCALHOST_HTTP = process.env.LOCALHOST_HTTP || '';

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
  networks: {
    localhost: {
      url: LOCALHOST_HTTP,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
