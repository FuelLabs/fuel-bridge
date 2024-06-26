import {
  setupEnvironment,
  ethers_parseToken,
  fuels_parseToken,
  waitForMessage,
  relayCommonMessage,
  logETHBalances,
  logTokenBalances,
  createRelayMessageParams,
  getOrDeployECR20Contract,
  mintECR20,
  getOrDeployL2Bridge,
  validateFundgibleContracts,
  getMessageOutReceipt,
  FUEL_MESSAGE_TIMEOUT_MS,
  FUEL_TX_PARAMS,
  waitForBlockCommit,
  waitForBlockFinalization,
  getTokenId,
  getBlock,
  FUEL_CALL_TX_PARAMS,
} from '@fuel-bridge/test-utils';
import type { TestEnvironment } from '@fuel-bridge/test-utils';
import { Address, BN, TransactionStatus } from 'fuels';

const TOKEN_AMOUNT = '10';

// This script is a demonstration of how ERC-20 tokens are bridged to and from the Fuel chain
(async function () {
  // basic setup routine which creates the connections (the "providers") to both chains,
  // funds addresses for us to test with and populates the official contract deployments
  // on the Ethereum chain for interacting with the Fuel chain
  console.log('Setting up environment...');
  const env: TestEnvironment = await setupEnvironment({});
  const ethAcct = env.eth.signers[0];
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
  const fuelTestToken = await getOrDeployL2Bridge(
    env,
    ethTestToken,
    env.eth.fuelERC20Gateway,
    FUEL_TX_PARAMS
  );
  const fuelTestTokenId = getTokenId(fuelTestToken);

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
  const eApproveTx = await ethTestToken.approve(
    await gatewayContract.getAddress(),
    ethers_parseToken(TOKEN_AMOUNT, 18)
  );
  const eApproveTxResult = await eApproveTx.wait();
  if (eApproveTxResult.status !== 1) {
    console.log(eApproveTxResult);
    throw new Error('failed to approve Token for transfer');
  }

  // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
  console.log(`Sending ${TOKEN_AMOUNT} Tokens from Ethereum...`);
  const eDepositTx = await gatewayContract.deposit(
    fuelAcctAddr,
    await ethTestToken.getAddress(),
    fuelTestToken.id.toHexString(),
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
    throw new Error(
      `message took longer than ${FUEL_MESSAGE_TIMEOUT_MS}ms to arrive on Fuel`
    );

  // relay the message to the target contract
  console.log('Relaying message on Fuel...');
  const fMessageRelayTx = await relayCommonMessage(
    fuelAcct,
    depositMessage,
    FUEL_TX_PARAMS
  );
  const fMessageRelayTxResult = await fMessageRelayTx.waitForResult();

  if (fMessageRelayTxResult.status !== TransactionStatus.success) {
    console.log(fMessageRelayTxResult.status);
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
    .txParams(FUEL_CALL_TX_PARAMS)
    .callParams({
      forward: {
        amount: fuels_parseToken(TOKEN_AMOUNT, 9),
        assetId: fuelTestTokenId,
      },
    });
  const fWithdrawTx = await scope.call();
  const fWithdrawTxResult = fWithdrawTx.transactionResult;
  if (fWithdrawTxResult.status !== TransactionStatus.success) {
    console.log(fWithdrawTxResult);
    throw new Error('failed to withdraw tokens to ethereum');
  }

  // get message proof for relaying on Ethereum
  console.log('Building message proof...');
  const messageOutReceipt = getMessageOutReceipt(fWithdrawTxResult.receipts);

  console.log('Waiting for block to be commited...');
  const withdrawBlock = await getBlock(
    env.fuel.provider.url,
    fWithdrawTxResult.blockId
  );
  const commitHashAtL1 = await waitForBlockCommit(
    env,
    withdrawBlock.header.height
  );

  console.log('Get message proof on Fuel...');
  const withdrawMessageProof = await fuelAcct.provider.getMessageProof(
    fWithdrawTxResult.id,
    messageOutReceipt.nonce,
    commitHashAtL1
  );

  console.log(commitHashAtL1);
  console.dir(withdrawMessageProof, { depth: null });

  // wait for block finalization
  await waitForBlockFinalization(env, withdrawMessageProof);
  const relayMessageParams = createRelayMessageParams(withdrawMessageProof);

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

  // the sent Tokens are now spendable on Fuel
  console.log('Tokens were bridged to Ethereum successfully!!');

  // note balances of both accounts after transfer
  await logTokenBalances(ethTestToken, ethAcct, fuelAcct, fuelTestTokenId);
})();
