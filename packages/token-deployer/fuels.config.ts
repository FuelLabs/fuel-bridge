import { config as dotEnvConfig } from 'dotenv';
import { Address, createConfig } from 'fuels';

dotEnvConfig();

const {
  FUEL_PROVIDER_URL,
  FUEL_PRIVATE_KEY,
  FUEL_BRIDGED_TOKEN_GATEWAY,
  BRIDGED_TOKEN,
  TOKEN_NAME,
  TOKEN_NAME_SYMBOL
} = process.env;

export default createConfig({
  output: './.types',
  contracts: ['./bridge-fungible-token'],
  useBuiltinForc: true,
  useBuiltinFuelCore: false,
  privateKey: FUEL_PRIVATE_KEY,
  providerUrl: FUEL_PROVIDER_URL,
  deployConfig: {
    gasPrice: 1,
    configurableConstants: {
      DECIMALS: 9,
      BRIDGED_TOKEN_DECIMALS: 18,
      BRIDGED_TOKEN_GATEWAY: Address.fromEvmAddress(FUEL_BRIDGED_TOKEN_GATEWAY!).toB256(),
      BRIDGED_TOKEN: Address.fromEvmAddress(BRIDGED_TOKEN!).toB256(),
      NAME: String(TOKEN_NAME).padEnd(64),
      SYMBOL: String(TOKEN_NAME_SYMBOL).padEnd(32),
    }
  }
});
