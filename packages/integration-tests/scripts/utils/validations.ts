import type { Token } from '@fuel-bridge/portal-contracts';
import type { Contract } from 'fuels';

import type { TestEnvironment } from '../setup';

export async function validateFundgibleContracts(
  env: TestEnvironment,
  fuelTestToken: Contract,
  ethTestToken: Token
) {
  const ethTestTokenAddress = ethTestToken.address;

  const l1Decimals = parseInt(
    (await fuelTestToken.functions.bridged_token_decimals().dryRun()).value
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
    (await fuelTestToken.functions.bridged_token().dryRun()).value.substring(
      26
    );
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
      await fuelTestToken.functions.bridged_token_gateway().dryRun()
    ).value.substring(26);
  if (
    l1Gateway.toLowerCase() != env.eth.fuelERC20Gateway.address.toLowerCase()
  ) {
    throw new Error(
      [
        'L1 token gateway address from the Fuel token contract does not match the actual L1 token gateway address',
        `[expected:${env.eth.fuelERC20Gateway.address}, actual:${l1Gateway}].`,
      ].join(' ')
    );
  }
}
