import type { HardhatUserConfig } from 'hardhat/types';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-network-helpers';
import '@nomicfoundation/hardhat-verify';
import '@nomicfoundation/hardhat-chai-matchers';
import '@typechain/hardhat';
import '@openzeppelin/hardhat-upgrades';
import 'hardhat-deploy';
import 'solidity-coverage';

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
  typechain: {
    outDir: 'typechain',
  },
};

export default config;
