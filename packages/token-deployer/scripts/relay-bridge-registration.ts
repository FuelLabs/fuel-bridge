import { createRelayMessageParams, getBlock, getBlockCommitStatus, getMessageOutReceipt } from '@fuel-bridge/test-utils';
import { TransactionResponse, arrayify } from 'fuels';

import { getConfigs } from './config';

async function relayBridgeRegistration() {
    const { data, provider, ethProvider, ethFuelMessagePortal, ethFuelChainState } = await getConfigs();
    const { transactionId } = data;
    if (!transactionId) {
      throw new Error('No transactionId found on data.json!');
    }
    const txResp = new TransactionResponse(transactionId, provider);
    const txResult = await txResp.waitForResult();

    if (!txResult) {
      throw new Error('No transaction found for the transaction id!');
    }

    const block = await getBlock(provider.url, txResult.blockId!);
    
    const { isCommitted, commitHashAtL1 } = await getBlockCommitStatus({
      ethProvider,
      fuelProvider: provider,
      fuelChainStateContract: ethFuelChainState,
    }, block.header.height.toString());

    if (!isCommitted) {
      console.log('Block not committed yet!');
      return;
    }

    // Create messageProof
    const { nonce } = getMessageOutReceipt(txResult.receipts);
    const messageProof = await provider.getMessageProof(
      transactionId,
      nonce,
      commitHashAtL1
    );

    // Check is finalized
    const isFinalized = await ethFuelChainState.finalized(
      arrayify(messageProof.commitBlockHeader.id),
      messageProof.commitBlockHeader.height.toString()
    );
    if (!isFinalized) {
      console.log('Block not finalized yet!');
      return;
    }

    // Relay message
    const relayMessageParams = createRelayMessageParams(messageProof);
    const result = await ethFuelMessagePortal.relayMessage(
      relayMessageParams.message,
      relayMessageParams.rootBlockHeader,
      relayMessageParams.blockHeader,
      relayMessageParams.blockInHistoryProof,
      relayMessageParams.messageInBlockProof
    )
    .then((tx) => tx.wait());

    if (result.status === 1) {
      console.log('Bridge registered!');
    }

}

relayBridgeRegistration()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })