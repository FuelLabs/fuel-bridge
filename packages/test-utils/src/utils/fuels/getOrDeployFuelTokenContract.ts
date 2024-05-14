import {
  fungibleTokenBinary,
  fungibleTokenABI,
} from '@fuel-bridge/fungible-token';
import type { AddressLike } from 'ethers';
import type { TxParams } from 'fuels';
import { ContractFactory, Contract } from 'fuels';

import { debug } from '../logs';
import { eth_address_to_b256 } from '../parsers';
import type { TestEnvironment } from '../setup';

const { FUEL_FUNGIBLE_TOKEN_ADDRESS } = process.env;

export async function getOrDeployFuelTokenContract(
  env: TestEnvironment,
  ethTokenGateway: AddressLike,
  fuelTxParams: TxParams,
  DECIMALS?: number
) {
  if (typeof ethTokenGateway !== 'string') {
    ethTokenGateway =
      'then' in ethTokenGateway
        ? await ethTokenGateway
        : await ethTokenGateway.getAddress();
  }

  const tokenGateway = ethTokenGateway.replace('0x', '');
  const fuelAcct = env.fuel.signers[1];

  let fuelTestToken: Contract = null;
  if (FUEL_FUNGIBLE_TOKEN_ADDRESS) {
    try {
      fuelTestToken = new Contract(
        FUEL_FUNGIBLE_TOKEN_ADDRESS,
        fungibleTokenABI,
        fuelAcct
      );
      await fuelTestToken.functions.name().dryRun();
    } catch (e) {
      fuelTestToken = null;
      debug(
        `The Fuel fungible token contract could not be found at the provided address ${FUEL_FUNGIBLE_TOKEN_ADDRESS}.`
      );
    }
  }
  if (!fuelTestToken) {
    debug(`Creating Fuel fungible token contract to test with...`);
    const bytecodeHex = fungibleTokenBinary;
    debug('Replace ECR20 contract id');
    debug('Deploy contract on Fuel');
    const factory = new ContractFactory(
      bytecodeHex,
      fungibleTokenABI,
      env.fuel.deployer
    );

    const configurableConstants: any = {
      BRIDGED_TOKEN_GATEWAY: eth_address_to_b256(tokenGateway),
    };

    if (DECIMALS !== undefined) configurableConstants['DECIMALS'] = DECIMALS;

    // Set the token gateway and token address in the contract
    factory.setConfigurableConstants(configurableConstants);

    const { contractId, transactionRequest } = factory.createTransactionRequest(
      {
        ...fuelTxParams,
        storageSlots: [],
      }
    );
    const { requiredQuantities } = await fuelAcct.provider.getTransactionCost(
      transactionRequest
    );

    await fuelAcct.fund(transactionRequest, {
      requiredQuantities,
      estimatedPredicates: [],
      addedSignatures: 0,
    });
    // send transaction
    const response = await fuelAcct.sendTransaction(transactionRequest);
    await response.wait();
    // create contract instance
    fuelTestToken = new Contract(
      contractId,
      factory.interface,
      factory.account
    );
    debug(
      `Fuel fungible token contract created at ${fuelTestToken.id.toHexString()}.`
    );

    const [fuelSigner] = env.fuel.signers;
    fuelTestToken.account = fuelSigner;

    debug('Set up bridge contract');
  }
  fuelTestToken.account = fuelAcct;
  const fuelTestTokenId = fuelTestToken.id.toHexString();
  debug(`Testing with Fuel fungible token contract at ${fuelTestTokenId}.`);

  return fuelTestToken;
}
