import type { Token } from '@fuel-bridge/solidity-contracts/typechain';
import type { Contract } from 'fuels';

import { FUEL_CALL_TX_PARAMS } from './constants';
import type { TestEnvironment } from './setup';

export async function validateFundgibleContracts(
  env: TestEnvironment,
  fuelTestToken: Contract,
  ethTestToken: Token
) {
  const ethTestTokenAddress = await ethTestToken.getAddress();
  const fuelErc20GatewayAddress = (
    await env.eth.fuelERC20Gateway.getAddress()
  ).toLowerCase();

  const l1Decimals = parseInt(
    (
      await fuelTestToken.functions
        .bridged_token_decimals()
        .txParams(FUEL_CALL_TX_PARAMS)
        .dryRun()
    ).value
  );
  const expectedL1Decimals = parseInt(String(await ethTestToken.decimals()));
  if (l1Decimals != expectedL1Decimals) {
    throw new Error(
      [
        'L1 decimals from the Fuel token contract does not match the actual L1 decimals.',
        `[expected:${expectedL1Decimals}, actual:${l1Decimals}].`,
      ].join(' ')
    );
  }
  const l1Token =
    '0x' +
    (
      await fuelTestToken.functions
        .bridged_token()
        .txParams(FUEL_CALL_TX_PARAMS)
        .dryRun()
    ).value.substring(26);
  if (l1Token.toLowerCase() != ethTestTokenAddress.toLowerCase()) {
    throw new Error(
      [
        'L1 token address from the Fuel token contract does not match the actual L1 token address.',
        `[expected:${ethTestTokenAddress}, actual:${l1Token}]`,
      ].join(' ')
    );
  }
  const l1Gateway =
    '0x' +
    (
      await fuelTestToken.functions
        .bridged_token_gateway()
        .txParams(FUEL_CALL_TX_PARAMS)
        .dryRun()
    ).value.substring(26);
  if (l1Gateway.toLowerCase() != fuelErc20GatewayAddress.toLowerCase()) {
    throw new Error(
      [
        'L1 token gateway address from the Fuel token contract does not match the actual L1 token gateway address',
        `[expected:${fuelErc20GatewayAddress}, actual:${l1Gateway}].`,
      ].join(' ')
    );
  }
}
