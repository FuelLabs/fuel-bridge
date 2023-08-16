import { parseEther } from 'ethers/lib/utils';
import { Address, BN, SimplifiedTransactionStatusNameEnum } from 'fuels';
import { TestEnvironment, setupEnvironment } from '../scripts/setup';
import { createRelayMessageParams } from './utils/ethers/createRelayParams';
import { waitNextBlock } from './utils/fuels/waitNextBlock';
import { logETHBalances } from './utils/logs';
import { waitForMessage } from './utils/fuels/waitForMessage';
import { fuels_parseEther } from './utils/parsers';
import { getMessageOutReceipt } from './utils/fuels/getMessageOutReceipt';
import { FUEL_MESSAGE_TIMEOUT_MS, FUEL_TX_PARAMS } from './utils/constants';
import { waitForBlockCommit } from './utils/ethers/waitForBlockCommit';
import { waitForBlockFinalization } from './utils/ethers/waitForBlockFinalization';

const ETH_AMOUNT = '0.1';

// This script is a demonstration of how the base asset (ETH) is bridged to and from the Fuel chain
(async function () {
  // basic setup routine which creates the connections (the "providers") to both chains,
  // funds addresses for us to test with and populates the official contract deployments
  // on the Ethereum chain for interacting with the Fuel chain
  console.log('Setting up environment...');
  console.log('');
  const env: TestEnvironment = await setupEnvironment({});
  const ethereumAccount = env.eth.signers[0];
  const ethereumAccountAddress = await ethereumAccount.getAddress();
  const fuelAccount = env.fuel.signers[0];
  const fuelAccountAddress = fuelAccount.address.toHexString();
  const fuelMessagePortal = env.eth.fuelMessagePortal.connect(ethereumAccount);

  /////////////////////////////
  // Bridge Ethereum -> Fuel //
  /////////////////////////////

  // note balances of both accounts before transfer
  await logETHBalances(ethereumAccount, fuelAccount);

  // use the FuelMessagePortal to directly send ETH to the fuel account
  console.log(`Sending ${ETH_AMOUNT} ETH from Ethereum...`);
  const eSendTx = await fuelMessagePortal.depositETH(fuelAccountAddress, {
    value: parseEther(ETH_AMOUNT),
  });
  const eSendTxResult = await eSendTx.wait();
  if (eSendTxResult.status !== 1) {
    console.log(eSendTxResult);
    throw new Error('failed to call depositETH');
  }

  // parse events from logs to get the message nonce
  const event = fuelMessagePortal.interface.parseLog(eSendTxResult.logs[0]);
  const depositMessageNonce = new BN(event.args.nonce.toHexString());

  // wait for message to appear in fuel client
  console.log('Waiting for ETH to arrive on Fuel...');
  const depositMessage = await waitForMessage(
    env.fuel.provider,
    fuelAccount.address,
    depositMessageNonce,
    FUEL_MESSAGE_TIMEOUT_MS
  );
  if (depositMessage == null)
    throw new Error(
      `message took longer than ${FUEL_MESSAGE_TIMEOUT_MS}ms to arrive on Fuel`
    );
  console.log('');

  // the sent ETH is now spendable on Fuel
  console.log('ETH was bridged to Fuel successfully!!');

  // note balances of both accounts after transfer
  await logETHBalances(ethereumAccount, fuelAccount);

  /////////////////////////////
  // Bridge Fuel -> Ethereum //
  /////////////////////////////

  // withdraw ETH back to the base chain
  console.log(`Sending ${ETH_AMOUNT} ETH from Fuel...`);
  const fWithdrawTx = await fuelAccount.withdrawToBaseLayer(
    Address.fromString(ethereumAccountAddress),
    fuels_parseEther(ETH_AMOUNT),
    FUEL_TX_PARAMS
  );
  const fWithdrawTxResult = await fWithdrawTx.waitForResult();
  if (
    fWithdrawTxResult.status !== SimplifiedTransactionStatusNameEnum.success
  ) {
    console.log(fWithdrawTxResult);
    throw new Error('failed to withdraw ETH back to base layer');
  }

  // wait for next block to be created
  console.log('Waiting for next block to be created...');
  const lastBlockId = await waitNextBlock(env, fWithdrawTxResult.blockId);

  // get message proof for relaying on Ethereum
  console.log('Building message proof...');
  const messageOutReceipt = getMessageOutReceipt(fWithdrawTxResult.receipts);

  // TODO: use the getMessageProof function from fuel-ts instead once it's updated with
  // the new message proof data
  // const withdrawMessageProof = await env.fuel.provider.getMessageProof(
  //   fWithdrawTx.id, messageOutReceipt.messageId, lastBlockId
  // );
  const withdrawMessageProof = await fuelAccount.provider.getMessageProof(
    fWithdrawTx.id,
    messageOutReceipt.messageId,
    lastBlockId
  );
  const relayMessageParams = createRelayMessageParams(withdrawMessageProof);

  // commit block to L1
  await waitForBlockCommit(env, relayMessageParams.rootBlockHeader);
  // wait for block finalization
  await waitForBlockFinalization(env, relayMessageParams.rootBlockHeader);

  // relay message on Ethereum
  console.log('Relaying message on Ethereum...\n');
  const eRelayMessageTx = await fuelMessagePortal.relayMessage(
    relayMessageParams.message,
    relayMessageParams.rootBlockHeader,
    relayMessageParams.blockHeader,
    relayMessageParams.blockInHistoryProof,
    relayMessageParams.messageInBlockProof
  );
  const eRelayMessageTxResult = await eRelayMessageTx.wait();
  if (eRelayMessageTxResult.status !== 1) {
    throw new Error('failed to call relayMessageFromFuelBlock');
  }

  // the sent ETH is now spendable on Fuel
  console.log('ETH was bridged to Ethereum successfully!!\n');
  // note balances of both accounts after transfer
  await logETHBalances(ethereumAccount, fuelAccount);
})();
