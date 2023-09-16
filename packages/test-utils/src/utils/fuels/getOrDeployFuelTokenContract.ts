import {
  fungibleTokenBinary,
  fungibleTokenABI,
} from '@fuel-bridge/fungible-token';
import type { Token } from '@fuel-bridge/solidity-contracts/typechain';
import type { TxParams } from 'fuels';
import { ContractFactory, bn, Contract } from 'fuels';

import { debug } from '../logs';
import { eth_address_to_b256 } from '../parsers';
import type { TestEnvironment } from '../setup';

const { FUEL_FUNGIBLE_TOKEN_ADDRESS } = process.env;

export async function getOrDeployFuelTokenContract(
  env: TestEnvironment,
  ethTestToken: Token,
  fuelTxParams: TxParams
) {
  const tokenGetWay = env.eth.fuelERC20Gateway.address.replace('0x', '');
  const tokenAddress = ethTestToken.address.replace('0x', '');
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

    // Set the token gateway and token address in the contract
    factory.setConfigurableConstants({
      BRIDGED_TOKEN_GATEWAY: eth_address_to_b256(tokenGetWay),
      BRIDGED_TOKEN: eth_address_to_b256(tokenAddress),
    });

    const { contractId, transactionRequest } = factory.createTransactionRequest(
      {
        ...fuelTxParams,
        storageSlots: [],
      }
    );
    // This for avoiding transaction for failing because of insufficient funds
    // The current fund method only accounts for a static gas fee that is not
    // enough for deploying a contract
    transactionRequest.gasPrice = bn(100_000);
    await fuelAcct.fund(transactionRequest);
    // Chnage gas price back to the original value provided via params
    transactionRequest.gasPrice = bn(fuelTxParams.gasPrice);
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
  }
  fuelTestToken.account = fuelAcct;
  const fuelTestTokenId = fuelTestToken.id.toHexString();
  debug(`Testing with Fuel fungible token contract at ${fuelTestTokenId}.`);

  return fuelTestToken;
}
