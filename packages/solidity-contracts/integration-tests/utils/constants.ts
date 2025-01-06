import type { TxParams } from 'fuels';
import { bn } from 'fuels';

const FUEL_GAS_LIMIT = 100000000;
const FUEL_MAX_FEE = 1;
export const FUEL_TX_PARAMS: TxParams = {
  gasLimit: process.env.FUEL_GAS_LIMIT || FUEL_GAS_LIMIT,
  maxFee: process.env.FUEL_MAX_FEE || FUEL_MAX_FEE,
};
export const FUEL_CALL_TX_PARAMS = {
  gasLimit: bn(10_000_000),
  maxFee: FUEL_TX_PARAMS.maxFee,
};
