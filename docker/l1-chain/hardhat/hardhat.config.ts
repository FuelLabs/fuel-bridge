import type { HardhatUserConfig } from 'hardhat/types';

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
};

export default config;
