import { formatEther, parseEther } from 'ethers/lib/utils';
import { Address, BN, TransactionResultMessageOutReceipt, ZeroBytes32 } from 'fuels';
import { TestEnvironment, setupEnvironment } from '../scripts/setup';
import { fuels_formatEther, fuels_messageToCoin, fuels_parseEther, fuels_waitForMessage } from '../scripts/utils';

const ETH_AMOUNT = '0.1';
const FUEL_MESSAGE_TIMEOUT_MS = 60_000;

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
  console.log('Account balances:');
  console.log('  Ethereum - ' + formatEther(await ethereumAccount.getBalance()) + ' ETH (' + ethereumAccountAddress + ')');
  console.log('  Fuel - ' + fuels_formatEther(await fuelAccount.getBalance(ZeroBytes32)) + ' ETH (' + fuelAccountAddress + ')');
  console.log('');

  // use the FuelMessagePortal to directly send ETH to the fuel account
  console.log('Sending ' + ETH_AMOUNT + ' ETH from Ethereum...');
  const eSendTx = await fuelMessagePortal.sendETH(fuelAccountAddress, { value: parseEther(ETH_AMOUNT) });
  const eSendTxResult = await eSendTx.wait();
  if (eSendTxResult.status !== 1) {
    console.log(eSendTxResult);
    throw new Error('failed to call sendETH');
  }

  // parse events from logs to get the message nonce
  const event = fuelMessagePortal.interface.parseLog(eSendTxResult.logs[0]);
  const depositMessageNonce = new BN(event.args.nonce.toHexString());

  // wait for message to appear in fuel client
  console.log('Waiting for ETH to arrive on Fuel...');
  const depositMessage = await fuels_waitForMessage(env.fuel.provider, fuelAccount.address, depositMessageNonce, FUEL_MESSAGE_TIMEOUT_MS);
  if (depositMessage == null)
    throw new Error('message took longer than ' + FUEL_MESSAGE_TIMEOUT_MS + 'ms to arrive on Fuel');
  console.log('');

  // the sent ETH is now spendable on Fuel
  console.log('ETH was bridged to Fuel successfully!!');

  // note balances of both accounts after transfer
  console.log('Account balances:');
  console.log('  Ethereum - ' + formatEther(await ethereumAccount.getBalance()) + ' ETH (' + ethereumAccountAddress + ')');
  console.log('  Fuel - ' + fuels_formatEther(await fuelAccount.getBalance(ZeroBytes32)) + ' ETH (' + fuelAccountAddress + ')');
  console.log('');

  // TODO: the below step is only there to avoid a bug in the SDK when a wallet has spendable messages
  console.log('[BUG FIX] Converting message input to coin input...');
  const fMessageToCoinTx = await fuels_messageToCoin(fuelAccount, depositMessage);
  const fMessageToCoinTxResult = await fMessageToCoinTx.waitForResult();
  if (fMessageToCoinTxResult.status.type !== 'success') {
    console.log(fMessageToCoinTxResult);
    throw new Error('failed to convert message to coin');
  }
  console.log('  Ethereum - ' + formatEther(await ethereumAccount.getBalance()) + ' ETH (' + ethereumAccountAddress + ')');
  console.log('  Fuel - ' + fuels_formatEther(await fuelAccount.getBalance(ZeroBytes32)) + ' ETH (' + fuelAccountAddress + ')');
  console.log('');

  /////////////////////////////
  // Bridge Fuel -> Ethereum //
  /////////////////////////////

  // withdraw ETH back to the base chain
  console.log('Sending ' + ETH_AMOUNT + ' ETH from Fuel...');
  const fWithdrawTx = await fuelAccount.withdrawToBaseLayer(Address.fromString(ethereumAccountAddress), fuels_parseEther(ETH_AMOUNT));
  const fWithdrawTxResult = await fWithdrawTx.waitForResult();
  if (fWithdrawTxResult.status.type !== 'success') {
    console.log(fWithdrawTxResult);
    throw new Error('failed to withdraw ETH back to base layer');
  }

  // get message proof for relaying on Ethereum
  console.log('Building message proof...');
  const messageOutReceipt = <TransactionResultMessageOutReceipt>fWithdrawTxResult.receipts[0];
  const withdrawMessageProof = await env.fuel.provider.getMessageProof(fWithdrawTx.id, messageOutReceipt.messageID);

  // construct relay message proof data
  const messageOutput: MessageOutput = {
    sender: withdrawMessageProof.sender.toHexString(),
    recipient: withdrawMessageProof.recipient.toHexString(),
    amount: withdrawMessageProof.amount.toHex(),
    nonce: withdrawMessageProof.nonce,
    data: withdrawMessageProof.data,
  };
  const blockHeader: BlockHeader = {
    prevRoot: withdrawMessageProof.header.prevRoot,
    height: withdrawMessageProof.header.height.toHex(),
    timestamp: new BN(withdrawMessageProof.header.time).toHex(),
    daHeight: withdrawMessageProof.header.daHeight.toHex(),
    txCount: withdrawMessageProof.header.transactionsCount.toHex(),
    outputMessagesCount: withdrawMessageProof.header.outputMessagesCount.toHex(),
    txRoot: withdrawMessageProof.header.transactionsRoot,
    outputMessagesRoot: withdrawMessageProof.header.outputMessagesRoot,
  };
  const messageInBlockProof = {
    key: withdrawMessageProof.proofIndex.toNumber(),
    proof: withdrawMessageProof.proofSet.slice(0, -1),
  };

  // relay message on Ethereum
  console.log('Relaying message on Ethereum...');
  const eRelayMessageTx = await fuelMessagePortal.relayMessageFromFuelBlock(
    messageOutput,
    blockHeader,
    messageInBlockProof,
    withdrawMessageProof.signature
  );
  const eRelayMessageTxResult = await eRelayMessageTx.wait();
  if (eRelayMessageTxResult.status !== 1) {
    console.log(eRelayMessageTxResult);
    throw new Error('failed to call relayMessageFromFuelBlock');
  }
  console.log('');

  // the sent ETH is now spendable on Fuel
  console.log('ETH was bridged to Ethereum successfully!!');

  // note balances of both accounts after transfer
  console.log('Account balances:');
  console.log('  Ethereum - ' + formatEther(await ethereumAccount.getBalance()) + ' ETH (' + ethereumAccountAddress + ')');
  console.log('  Fuel - ' + fuels_formatEther(await fuelAccount.getBalance(ZeroBytes32)) + ' ETH (' + fuelAccountAddress + ')');
  console.log('');

  // done!
  console.log('');
  console.log('END');
  console.log('');
})();

// The BlockHeader structure.
class BlockHeader {
  constructor(
    // Consensus
    public prevRoot: string,
    public height: string,
    public timestamp: string,

    // Application
    public daHeight: string,
    public txCount: string,
    public outputMessagesCount: string,
    public txRoot: string,
    public outputMessagesRoot: string
  ) {}
}

// The MessageOutput structure.
class MessageOutput {
  constructor(
    public sender: string,
    public recipient: string,
    public amount: string,
    public nonce: string,
    public data: string
  ) {}
}
