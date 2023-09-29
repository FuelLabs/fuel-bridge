import { config as dotEnvConfig } from 'dotenv';
import type { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
dotEnvConfig();
const config: HardhatUserConfig = {
  solidity: '0.8.9',
  typechain: {
    outDir: './typechain',
  },
};

export default config;
