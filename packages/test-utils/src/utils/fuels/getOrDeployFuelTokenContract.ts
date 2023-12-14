import {
  fungibleTokenBinary,
  fungibleTokenABI,
} from '@fuel-bridge/fungible-token';
import type { ethers } from 'ethers';
import type { TxParams } from 'fuels';
import {
  ContractFactory,
  bn,
  Contract,
  TransactionStatus,
  InputType,
} from 'fuels';

import {
  createRelayMessageParams,
  waitForBlockCommit,
  waitForBlockFinalization,
} from '../ethers';
import { debug } from '../logs';
import { eth_address_to_b256 } from '../parsers';
import type { TestEnvironment } from '../setup';

import { getBlock } from './getBlock';
import { getMessageOutReceipt } from './getMessageOutReceipt';

const { FUEL_FUNGIBLE_TOKEN_ADDRESS } = process.env;

export async function getOrDeployFuelTokenContract(
  env: TestEnvironment,
  ethTestToken: ethers.Contract,
  ethTokenGateway: { address: string },
  fuelTxParams: TxParams,
  DECIMALS?: number
) {
  const tokenGateway = ethTokenGateway.address.replace('0x', '');
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

    const BRIDGED_TOKEN_DECIMALS: number =
      'decimals' in ethTestToken.callStatic
        ? await ethTestToken.callStatic.decimals()
        : 0;

    const configurableConstants: any = {
      BRIDGED_TOKEN_DECIMALS,
      BRIDGED_TOKEN_GATEWAY: eth_address_to_b256(tokenGateway),
      BRIDGED_TOKEN: eth_address_to_b256(tokenAddress),
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
    const { maxFee, requiredQuantities } =
      await fuelAcct.provider.getTransactionCost(transactionRequest);
    await fuelAcct.fund(transactionRequest, requiredQuantities, maxFee);
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

    await fuelTestToken.functions
      .register_bridge()
      .txParams({
        gasPrice: bn(fuelTxParams.gasPrice),
        gasLimit: bn(10_000)
      })
      .callParams({
        gasLimit: bn(10_000)
      })
      .fundWithRequiredCoins(maxFee)
      .then((scope) => scope.getTransactionRequest())
      .then((txRequest) => {
        txRequest.inputs = txRequest.inputs.filter(
          (i) => i.type !== InputType.Message
        );
        return txRequest;
      })
      .then((txRequest) => fuelTestToken.account.sendTransaction(txRequest))
      .then((txResponse) => txResponse.waitForResult())
      .then((txResult) =>
        txResult.status === TransactionStatus.success
          ? Promise.all([
              txResult,
              getBlock(env.fuel.provider.url, txResult.blockId!),
            ])
          : Promise.reject('register_bridge() transaction failed')
      )
      .then(([txResult, block]) =>
        Promise.all([txResult, waitForBlockCommit(env, block.header.height)])
      )
      .then(([txResult, commitHash]) => {
        const { nonce } = getMessageOutReceipt(txResult.receipts);

        return env.fuel.provider.getMessageProof(
          txResult.id!,
          nonce,
          commitHash
        );
      })
      .then((messageProof) => 
        Promise.all([
          createRelayMessageParams(messageProof),
          waitForBlockFinalization(env, messageProof),
        ])
      )
      .then(([relayMessageParams]) => 
      env.eth.fuelMessagePortal.relayMessage(
          relayMessageParams.message,
          relayMessageParams.rootBlockHeader,
          relayMessageParams.blockHeader,
          relayMessageParams.blockInHistoryProof,
          relayMessageParams.messageInBlockProof
        )
      )
      .then((tx) => tx.wait());

    debug('Set up bridge contract');
  }
  fuelTestToken.account = fuelAcct;
  const fuelTestTokenId = fuelTestToken.id.toHexString();
  debug(`Testing with Fuel fungible token contract at ${fuelTestTokenId}.`);

  return fuelTestToken;
}
