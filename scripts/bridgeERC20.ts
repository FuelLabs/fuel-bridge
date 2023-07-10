import { TestEnvironment, setupEnvironment } from '../scripts/setup';
import { Address, BN } from 'fuels';
import { ethers_parseToken, fuels_parseToken } from './utils/parsers';
import { waitForMessage } from './utils/fuels/waitForMessage';
import { relayCommonMessage } from './utils/fuels/relayCommonMessage';
import { logETHBalances, logTokenBalances } from './utils/logs';
import { waitNextBlock } from './utils/fuels/waitNextBlock';
import { createRelayMessageParams } from './utils/ethers/createRelayParams';
import { commitBlock, mockFinalization } from './utils/ethers/commitBlock';
import { getOrDeployECR20Contract, mintECR20 } from './utils/ethers/getOrDeployECR20Contract';
import { getOrDeployFuelTokenContract } from './utils/fuels/getOrDeployFuelTokenContract';
import { validateFundgibleContracts } from './utils/validations';
import { getMessageOutReceipt } from './utils/fuels/getMessageOutReceipt';
import { FUEL_MESSAGE_TIMEOUT_MS, FUEL_TX_PARAMS } from './utils/constants';

const TOKEN_AMOUNT = '10';

// This script is a demonstration of how ERC-20 tokens are bridged to and from the Fuel chain
(async function () {
  // basic setup routine which creates the connections (the "providers") to both chains,
  // funds addresses for us to test with and populates the official contract deployments
  // on the Ethereum chain for interacting with the Fuel chain
  console.log('Setting up environment...');
  const env: TestEnvironment = await setupEnvironment({});
  const ethAcct = env.eth.signers[1];
  const ethAcctAddr = await ethAcct.getAddress();
  const fuelAcct = env.fuel.signers[1];
  const fuelAcctAddr = fuelAcct.address.toHexString();
  const fuelMessagePortal = env.eth.fuelMessagePortal.connect(ethAcct);
  const gatewayContract = env.eth.fuelERC20Gateway.connect(ethAcct);
  ////////////////////////////////////
  // Connect/Create Token Contracts //
  ////////////////////////////////////

  await logETHBalances(ethAcct, fuelAcct);

  // load ERC20 contract
  const ethTestToken = await getOrDeployECR20Contract(env);

  // load Fuel side fungible token contract
  const fuelTestToken = await getOrDeployFuelTokenContract(env, ethTestToken, FUEL_TX_PARAMS);
  const fuelTestTokenId = fuelTestToken.id.toHexString();

  // mint tokens as starting balances
  await mintECR20(env, ethTestToken, ethAcctAddr, TOKEN_AMOUNT);
  await logTokenBalances(ethTestToken, ethAcct, fuelAcct, fuelTestTokenId);

  // verify compatability between the two token contracts
  await validateFundgibleContracts(env, fuelTestToken, ethTestToken);

  /////////////////////////////
  // Bridge Ethereum -> Fuel //
  /////////////////////////////

  // approve fuel erc20 gateway to spend the tokens
  console.log('Approving Tokens for gateway...');
  const eApproveTx = await ethTestToken.approve(gatewayContract.address, ethers_parseToken(TOKEN_AMOUNT, 18));
  const eApproveTxResult = await eApproveTx.wait();
  if (eApproveTxResult.status !== 1) {
    console.log(eApproveTxResult);
    throw new Error('failed to approve Token for transfer');
  }

  // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
  console.log(`Sending ${TOKEN_AMOUNT} Tokens from Ethereum...`);
  const eDepositTx = await gatewayContract.deposit(
    fuelAcctAddr,
    ethTestToken.address,
    fuelTestTokenId,
    ethers_parseToken(TOKEN_AMOUNT, 18)
  );
  const eDepositTxResult = await eDepositTx.wait();
  if (eDepositTxResult.status !== 1) {
    console.log(eDepositTxResult);
    throw new Error('failed to deposit Token for bridging');
  }

  // parse events from logs
  const event = fuelMessagePortal.interface.parseLog(eDepositTxResult.logs[2]);
  const depositMessageNonce = new BN(event.args.nonce.toHexString());
  const fuelTokenMessageReceiver = Address.fromB256(event.args.recipient);

  // wait for message to arrive on fuel
  console.log('Waiting for message to arrive on Fuel...');
  const depositMessage = await waitForMessage(
    env.fuel.provider,
    fuelTokenMessageReceiver,
    depositMessageNonce,
    FUEL_MESSAGE_TIMEOUT_MS
  );
  if (depositMessage == null)
    throw new Error(`message took longer than ${FUEL_MESSAGE_TIMEOUT_MS}ms to arrive on Fuel`);

  // relay the message to the target contract
  console.log('Relaying message on Fuel...');
  const fMessageRelayTx = await relayCommonMessage(fuelAcct, depositMessage, FUEL_TX_PARAMS);
  const fMessageRelayTxResult = await fMessageRelayTx.waitForResult();

  if (fMessageRelayTxResult.status.type !== 'success') {
    console.log(fMessageRelayTxResult.status.reason);
    console.log(fMessageRelayTxResult);
    console.log(fMessageRelayTxResult.transaction.inputs);
    console.log(fMessageRelayTxResult.transaction.outputs);
    throw new Error('failed to relay message from gateway');
  }
  console.log('');

  // the sent Tokens are now spendable on Fuel
  console.log('Tokens were bridged to Fuel successfully!!');

  // note balances of both accounts after transfer
  await logTokenBalances(ethTestToken, ethAcct, fuelAcct, fuelTestTokenId);

  /////////////////////////////
  // Bridge Fuel -> Ethereum //
  /////////////////////////////

  // withdraw tokens back to the base chain
  console.log(`Sending ${TOKEN_AMOUNT} Tokens from Fuel...`);
  const paddedAddress = '0x' + ethAcctAddr.slice(2).padStart(64, '0');
  const scope = fuelTestToken.functions
    .withdraw(paddedAddress)
    .callParams({
      forward: { amount: fuels_parseToken(TOKEN_AMOUNT, 9), assetId: fuelTestTokenId },
    })
    .txParams(FUEL_TX_PARAMS);
  const fWithdrawTx = await scope.call();
  const fWithdrawTxResult = fWithdrawTx.transactionResult;
  if (fWithdrawTxResult.status.type !== 'success') {
    console.log(fWithdrawTxResult);
    throw new Error('failed to withdraw tokens to ethereum');
  }

  // wait for next block to be created
  console.log('Waiting for next block to be created...');
  const lastBlockId = await waitNextBlock(env);

  // get message proof for relaying on Ethereum
  console.log('Building message proof...');
  const messageOutReceipt = getMessageOutReceipt(fWithdrawTxResult.receipts);

  const withdrawMessageProof = await fuelAcct.provider.getMessageProof(
    fWithdrawTx.transactionId,
    messageOutReceipt.messageId,
    lastBlockId
  );
  const relayMessageParams = createRelayMessageParams(withdrawMessageProof);

  // commit block to L1
  await commitBlock(env, relayMessageParams.rootBlockHeader);
  // wait for block finalization
  await mockFinalization(env);

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
    console.log(eRelayMessageTxResult);
    throw new Error('failed to call relayMessageFromFuelBlock');
  }
  console.log('');

  // the sent Tokens are now spendable on Fuel
  console.log('Tokens were bridged to Ethereum successfully!!');

  // note balances of both accounts after transfer
  await logTokenBalances(ethTestToken, ethAcct, fuelAcct, fuelTestTokenId);
})();
