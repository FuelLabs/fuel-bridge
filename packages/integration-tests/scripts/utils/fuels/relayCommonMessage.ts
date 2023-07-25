/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.
import {
  Message,
  WalletUnlocked as FuelWallet,
  ZeroBytes32,
  ScriptTransactionRequest,
  TransactionRequestLike,
  arrayify,
  InputType,
  hexlify,
  OutputType,
  TransactionResponse,
  Predicate,
  bn,
  MAX_GAS_PER_TX,
  CoinTransactionRequestInput,
  TransactionCoder,
  hashTransaction,
  transactionRequestify,
} from 'fuels';
import { debug } from '../logs';
import { resourcesToInputs } from './transaction';
import {
  contractMessagePredicate,
  contractMessageScript,
} from '@fuel-bridge/message-predicates';

// Create a predicate for common messages
const predicate = new Predicate(contractMessagePredicate, 0);

// Details for relaying common messages with certain predicate roots
const COMMON_RELAYABLE_MESSAGES: CommonMessageDetails[] = [
  {
    name: 'Message To Contract v1.3',
    predicateRoot: predicate.address.toHexString(),
    predicate: contractMessagePredicate,
    script: contractMessageScript,
    buildTx: async (
      relayer: FuelWallet,
      message: Message,
      details: CommonMessageDetails,
      txParams: Pick<
        TransactionRequestLike,
        'gasLimit' | 'gasPrice' | 'maturity'
      >
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
      const coins = resourcesToInputs(resources);

      // get contract id
      const data = arrayify(message.data);
      if (data.length < 32)
        throw new Error('cannot find contract ID in message data');
      const contractId = hexlify(data.slice(0, 32));

      // build the transaction
      const transaction = new ScriptTransactionRequest({
        script,
        gasLimit: MAX_GAS_PER_TX,
        ...txParams,
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
        contractId: contractId,
      });
      transaction.inputs.push(...coins);

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
type CommonMessageDetails = {
  name: string;
  predicateRoot: string;
  predicate: string;
  script: string;
  buildTx: (
    relayer: FuelWallet,
    message: Message,
    details: CommonMessageDetails,
    txParams: Pick<TransactionRequestLike, 'gasLimit' | 'gasPrice' | 'maturity'>
  ) => Promise<ScriptTransactionRequest>;
};

// Relay commonly used messages with predicates spendable by anyone
export async function relayCommonMessage(
  relayer: FuelWallet,
  message: Message,
  txParams: Pick<
    TransactionRequestLike,
    'gasLimit' | 'gasPrice' | 'maturity'
  > = {}
): Promise<TransactionResponse> {
  // find the relay details for the specified message
  let messageRelayDetails: CommonMessageDetails = null;
  const predicateRoot = message.recipient.toHexString();

  for (let details of COMMON_RELAYABLE_MESSAGES) {
    if (details.predicateRoot == predicateRoot) {
      messageRelayDetails = details;
      break;
    }
  }
  if (messageRelayDetails == null)
    throw new Error('message is not a common relayable message');

  // build and send transaction
  let transaction = await messageRelayDetails.buildTx(
    relayer,
    message,
    messageRelayDetails,
    txParams
  );

  // TODO: remove this once the estimatePredicate is fixed on the TS-SDK
  // https://github.com/FuelLabs/fuels-ts/issues/1129
  const encodedTransaction = transaction.toTransactionBytes();
  const response = await relayer.provider.operations.estimatePredicates({
    encodedTransaction: hexlify(encodedTransaction),
  });
  const [decodedTransaction] = new TransactionCoder().decode(
    arrayify(response.estimatePredicates.rawPayload),
    0
  );
  if (decodedTransaction.inputs) {
    decodedTransaction.inputs.forEach((input, index) => {
      if ('predicate' in input && input.predicateGasUsed.gt(0)) {
        (<CoinTransactionRequestInput>(
          transaction.inputs[index]
        )).predicateGasUsed = input.predicateGasUsed;
      }
    });
  }

  // TODO: remove this once the hashTransaction is fixed on the TS-SDK
  // https://github.com/FuelLabs/fuels-ts/issues/1128
  const txToSign = transactionRequestify(
    JSON.parse(JSON.stringify(transaction))
  );
  txToSign.inputs.map((i) => {
    if ('predicateGasUsed' in i) {
      i.predicateGasUsed = bn();
      return i;
    }
    return i;
  });
  const hash = hashTransaction(txToSign, 0);
  const signature = await relayer.signer().sign(hash);
  transaction.updateWitnessByOwner(relayer.address, signature);
  const {
    submit: { id: transactionId },
  } = await relayer.provider.operations.submit({
    encodedTransaction: hexlify(transaction.toTransactionBytes()),
  });
  return new TransactionResponse(transactionId, relayer.provider);

  // return relayer.sendTransaction(transaction);
}
