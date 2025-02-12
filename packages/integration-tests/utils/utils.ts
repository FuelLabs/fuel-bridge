import type { BridgeFungibleToken } from '@fuel-bridge/fungible-token';
import { type TestEnvironment } from '@fuel-bridge/test-utils';
import { BN } from 'fuels';
import type {
  WalletUnlocked as FuelWallet,
  MessageCoin,
  ScriptTransactionRequest,
} from 'fuels';

// funds the withdrawal transaction with `MessageCoin` or `Coin` type
export async function fundWithdrawalTransactionWithBaseAssetResource(
  env: TestEnvironment,
  fuelBridge: BridgeFungibleToken,
  fuelTokenSender: FuelWallet,
  to: string,
  amount: bigint,
  l2DecimalDifference: bigint,
  fuelBridgeImpl: BridgeFungibleToken,
  fuelAsset: string,
  useMessageCoin: boolean
): Promise<ScriptTransactionRequest> {
  const tx = await fuelBridge.functions
    .withdraw(to)
    .addContracts([fuelBridge, fuelBridgeImpl])
    .txParams({
      tip: 0,
      maxFee: 1,
    })
    .callParams({
      forward: {
        amount: new BN(amount.toString()).div(
          new BN((10n ** (18n - l2DecimalDifference)).toString())
        ),
        assetId: fuelAsset,
      },
    });
  if (useMessageCoin) {
    // fetch the message generated on bridging eth
    const incomingMessagesonFuel = await env.fuel.signers[0].getMessages();

    // construct message coin
    const messageCoin: MessageCoin = {
      assetId: env.fuel.provider.getBaseAssetId(),
      sender: incomingMessagesonFuel.messages[0].sender,
      recipient: incomingMessagesonFuel.messages[0].recipient,
      nonce: incomingMessagesonFuel.messages[0].nonce,
      daHeight: incomingMessagesonFuel.messages[0].daHeight,
      amount: incomingMessagesonFuel.messages[0].amount,
    };

    const transactionRequest = await tx.getTransactionRequest();

    // add message coin as input to fund the tx
    transactionRequest.addMessageInput(messageCoin);

    // add the erc20 token input which will be burnt on withdrawal
    const resource = await fuelTokenSender.getResourcesToSpend([
      [
        new BN(amount.toString()).div(
          new BN((10n ** (18n - l2DecimalDifference)).toString())
        ),
        fuelAsset,
      ],
    ]);

    transactionRequest.addResources(resource);

    // fetch tx cost
    const cost = await fuelTokenSender.getTransactionCost(transactionRequest);

    // update fee params
    transactionRequest.gasLimit = cost.gasUsed;
    transactionRequest.maxFee = cost.maxFee;

    return transactionRequest;
  } else {
    return await tx.fundWithRequiredCoins();
  }
}
