import { bn } from 'fuels';

// Constants
export const ETHEREUM_ETH_DECIMALS = 18n;
export const FUEL_ETH_DECIMALS = 9n;
export const FUEL_MESSAGE_POLL_MS: number = 300;
export const MAX_GAS_PER_TX = bn(100_000_000);
export const FUEL_GAS_LIMIT = 500_000_000;
export const FUEL_GAS_PRICE = 1;
export const FUEL_TX_PARAMS = {
  gasLimit: process.env.FUEL_GAS_LIMIT || FUEL_GAS_LIMIT,
  gasPrice: process.env.FUEL_GAS_PRICE || FUEL_GAS_PRICE,
};
export const FUEL_CALL_TX_PARAMS = {
  gasLimit: bn(10_000),
  gasPrice: FUEL_TX_PARAMS.gasPrice,
};
export const FUEL_MESSAGE_TIMEOUT_MS = 1_000_000;
