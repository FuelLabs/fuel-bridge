/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.
import {
  contractMessagePredicate,
  contractMessageScript,
} from '@fuel-bridge/message-predicates';
import type {
  Message,
  WalletUnlocked as FuelWallet,
  TransactionResponse,
  Provider,
  ScriptTransactionRequestLike,
} from 'fuels';
import {
  ZeroBytes32,
  ScriptTransactionRequest,
  arrayify,
  InputType,
  hexlify,
  OutputType,
  Predicate,
  bn,
} from 'fuels';

import { debug } from '../logs';

import { resourcesToInputs } from './transaction';

// Details for relaying common messages with certain predicate roots
function getCommonRelayableMessages(provider: Provider) {
  // Create a predicate for common messages
  const predicate = new Predicate({
    bytecode: contractMessagePredicate,
    provider,
  });

  // Details for relaying common messages with certain predicate roots
  const relayableMessages: CommonMessageDetails[] = [
    {
      name: 'Message To Contract v1.3',
      predicateRoot: predicate.address.toHexString(),
      predicate: contractMessagePredicate,
      script: contractMessageScript,
      buildTx: async (
        relayer: FuelWallet,
        message: Message,
        details: CommonMessageDetails
      ): Promise<ScriptTransactionRequest> => {
        const script = arrayify(details.script);
        const predicateBytecode = arrayify(details.predicate);
        // get resources to fund the transaction
        const resources = await relayer.getResourcesToSpend([
          {
            amount: bn.parseUnits('5'),
            assetId: ZeroBytes32,
          },
        ]);
        // convert resources to inputs
        const spendableInputs = resourcesToInputs(resources);

        // get contract id
        const data = arrayify(message.data);
        if (data.length < 32)
          throw new Error('cannot find contract ID in message data');
        const contractId = hexlify(data.slice(0, 32));

        // build the transaction
        const transaction = new ScriptTransactionRequest({
          script,
        });
        transaction.inputs.push({
          type: InputType.Message,
          amount: message.amount,
          sender: message.sender.toHexString(),
          recipient: message.recipient.toHexString(),
          witnessIndex: 0,
          data: message.data,
          nonce: message.nonce,
          predicate: predicateBytecode,
        });
        transaction.inputs.push({
          type: InputType.Contract,
          txPointer: ZeroBytes32,
          contractId,
        });
        transaction.inputs.push(...spendableInputs);

        transaction.outputs.push({
          type: OutputType.Contract,
          inputIndex: 1,
        });
        transaction.outputs.push({
          type: OutputType.Change,
          to: relayer.address.toB256(),
          assetId: ZeroBytes32,
        });
        transaction.outputs.push({
          type: OutputType.Variable,
        });

        transaction.witnesses.push('0x');

        transaction.gasLimit = bn(1_000_000);

        transaction.maxFee = bn(0);

        debug(
          '-------------------------------------------------------------------'
        );
        debug(transaction.inputs);
        debug(
          '-------------------------------------------------------------------'
        );
        debug(transaction.outputs);
        debug(
          '-------------------------------------------------------------------'
        );

        return transaction;
      },
    },
  ];

  return relayableMessages;
}

type CommonMessageDetails = {
  name: string;
  predicateRoot: string;
  predicate: string;
  script: string;
  buildTx: (
    relayer: FuelWallet,
    message: Message,
    details: CommonMessageDetails,
    txParams: Pick<ScriptTransactionRequestLike, 'gasLimit' | 'maturity'>
  ) => Promise<ScriptTransactionRequest>;
};

// Relay commonly used messages with predicates spendable by anyone
export async function relayCommonMessage(
  relayer: FuelWallet,
  message: Message,
  txParams?: Pick<ScriptTransactionRequestLike, 'gasLimit' | 'maturity'>
): Promise<TransactionResponse> {
  // find the relay details for the specified message
  let messageRelayDetails: CommonMessageDetails = null;
  const predicateRoot = message.recipient.toHexString();

  for (const details of getCommonRelayableMessages(relayer.provider)) {
    if (details.predicateRoot == predicateRoot) {
      messageRelayDetails = details;
      break;
    }
  }
  if (messageRelayDetails == null)
    throw new Error('message is not a common relayable message');

  // build and send transaction
  const transaction = await messageRelayDetails.buildTx(
    relayer,
    message,
    messageRelayDetails,
    txParams || {}
  );

  const estimated_tx = await relayer.provider.estimatePredicates(transaction);

  return relayer.sendTransaction(estimated_tx);
}
