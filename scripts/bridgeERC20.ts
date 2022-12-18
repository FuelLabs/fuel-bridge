import { ContractFactory } from '@fuel-ts/contract';
import { join } from 'path';
import { readFileSync } from 'fs';
import { TestEnvironment, setupEnvironment } from '../scripts/setup';
import { Token } from '../fuel-v2-contracts/Token.d';
import { Token__factory } from '../fuel-v2-contracts/factories/Token__factory';
import FuelFungibleTokenContractABI_json from '../bridge-fungible-token/bridge_fungible_token-abi.json';
import { Address, BN, Contract, TransactionResultMessageOutReceipt } from 'fuels';
import {
  delay,
  ethers_formatToken,
  ethers_parseToken,
  fuels_formatToken,
  fuels_parseToken,
  fuels_relayCommonMessage,
  fuels_waitForMessage,
} from '../scripts/utils';

const TOKEN_AMOUNT = '10';
const FUEL_MESSAGE_TIMEOUT_MS = 1_000_000;
const FUEL_GAS_LIMIT = 500_000_000;
const FUEL_GAS_PRICE = 1;
const ETH_ERC20_TOKEN_ADDRESS = process.env.ETH_ERC20_TOKEN_ADDRESS || '0x0165878A594ca255338adfa4d48449f69242Eb8F';
const FUEL_FUNGIBLE_TOKEN_ADDRESS = process.env.FUEL_FUNGIBLE_TOKEN_ADDRESS || '';

// This script is a demonstration of how ERC-20 tokens are bridged to and from the Fuel chain
(async function () {
  // basic setup routine which creates the connections (the "providers") to both chains,
  // funds addresses for us to test with and populates the official contract deployments
  // on the Ethereum chain for interacting with the Fuel chain
  console.log('Setting up environment...');
  const env: TestEnvironment = await setupEnvironment({});
  const ethDeployer = env.eth.deployer;
  const ethDeployerAddr = await ethDeployer.getAddress();
  const ethAccount = env.eth.signers[1];
  const ethAccountAddr = await ethAccount.getAddress();
  const fuelAccount = env.fuel.signers[1];
  const fuelAccountAddr = fuelAccount.address.toHexString();
  const fuelMessagePortal = env.eth.fuelMessagePortal.connect(ethAccount);
  const gatewayContract = env.eth.l1ERC20Gateway.connect(ethAccount);
  const fuelTxParams = {
    gasLimit: process.env.FUEL_GAS_LIMIT || FUEL_GAS_LIMIT,
    gasPrice: process.env.FUEL_GAS_PRICE || FUEL_GAS_PRICE,
  };

  ////////////////////////////////////
  // Connect/Create Token Contracts //
  ////////////////////////////////////

  // load ERC20 contract
  let ethTestToken: Token = null;
  if (ETH_ERC20_TOKEN_ADDRESS) {
    try {
      ethTestToken = Token__factory.connect(ETH_ERC20_TOKEN_ADDRESS, ethDeployer);
      const tokenOwner = await ethTestToken._owner();
      if (tokenOwner.toLowerCase() != ethDeployerAddr.toLowerCase()) {
        ethTestToken = null;
        console.log(
          `The Ethereum ERC-20 token at ${ETH_ERC20_TOKEN_ADDRESS} is not owned by the Ethereum deployer ${ethDeployerAddr}.`
        );
      }
    } catch (e) {
      ethTestToken = null;
      console.log(`The Ethereum ERC-20 token could not be found at the provided address ${ETH_ERC20_TOKEN_ADDRESS}.`);
    }
  }
  if (!ethTestToken) {
    console.log(`Creating ERC-20 token contract to test with...`);
    const eth_tokenFactory = new Token__factory(ethDeployer);
    ethTestToken = await eth_tokenFactory.deploy();
    await ethTestToken.deployed();
    console.log(`Ethereum ERC-20 token contract created at address ${ethTestToken.address}.`);
  }
  ethTestToken = ethTestToken.connect(ethAccount);
  const ethTestTokenAddress = ethTestToken.address;
  console.log(`Testing with Ethereum ERC-20 token contract at ${ethTestTokenAddress}.`);

  // load Fuel side fungible token contract
  let fuelTestToken: Contract = null;
  if (FUEL_FUNGIBLE_TOKEN_ADDRESS) {
    try {
      fuelTestToken = new Contract(FUEL_FUNGIBLE_TOKEN_ADDRESS, FuelFungibleTokenContractABI_json, fuelAccount);
      await fuelTestToken.functions.name().dryRun();
    } catch (e) {
      fuelTestToken = null;
      console.log(
        `The Fuel fungible token contract could not be found at the provided address ${FUEL_FUNGIBLE_TOKEN_ADDRESS}.`
      );
    }
  }
  if (!fuelTestToken) {
    console.log(`Creating Fuel fungible token contract to test with...`);
    const bytecode = readFileSync(join(__dirname, '../bridge-fungible-token/bridge_fungible_token.bin'));
    const factory = new ContractFactory(bytecode, FuelFungibleTokenContractABI_json, env.fuel.deployer);
    fuelTestToken = await factory.deployContract();
    console.log(`Fuel fungible token contract created at ${fuelTestToken.id.toHexString()}.`);
  }
  fuelTestToken.wallet = fuelAccount;
  const fuelTestTokenId = fuelTestToken.id.toHexString();
  console.log(`Testing with Fuel fungible token contract at ${fuelTestTokenId}.`);

  // mint tokens as starting balances
  if ((await ethTestToken.balanceOf(ethAccountAddr)) <= ethers_parseToken(TOKEN_AMOUNT, 18).mul(2)) {
    console.log(`Minting ERC-20 tokens to test with...`);
    const tokenMintTx1 = await ethTestToken
      .connect(env.eth.deployer)
      .mint(ethAccountAddr, ethers_parseToken('100', 18));
    await tokenMintTx1.wait();
  }
  console.log('');

  // verify compatability between the two token contracts
  // TODO: also verify the gateway contract matches on the fuel side fungible token contract
  const l1Decimals = parseInt('' + (await fuelTestToken.functions.layer1_decimals().dryRun()).value);
  const actualL1Decimals = parseInt('' + (await ethTestToken.decimals()));
  if (l1Decimals != actualL1Decimals) {
    throw new Error(
      `Expected L1 decimals from the Fuel token contract does not match the actual L1 decimals [expected:${l1Decimals}, actual:${actualL1Decimals}].`
    );
  }
  const l1Token = '0x' + (await fuelTestToken.functions.layer1_token().dryRun()).value.substring(26);
  if (l1Token.toLowerCase() != ethTestTokenAddress.toLowerCase()) {
    throw new Error(
      `Expected L1 token address from the Fuel token contract does not match the actual L1 token address [expected:${l1Token}, actual:${ethTestTokenAddress}].`
    );
  }

  /////////////////////////////
  // Bridge Ethereum -> Fuel //
  /////////////////////////////

  // note balances of both accounts before transfer
  console.log('Account balances:');
  console.log(
    `  Ethereum - ${ethers_formatToken(await ethTestToken.balanceOf(ethAccountAddr))} Tokens (${ethAccountAddr})`
  );
  console.log(
    `  Fuel - ${fuels_formatToken(await fuelAccount.getBalance(fuelTestTokenId))} Tokens (${fuelAccountAddr})`
  );
  console.log('');

  // approve l1 gateway to spend the tokens
  console.log('Approving Tokens for gateway...');
  const eApproveTx = await ethTestToken.approve(gatewayContract.address, ethers_parseToken(TOKEN_AMOUNT, 18));
  const eApproveTxResult = await eApproveTx.wait();
  if (eApproveTxResult.status !== 1) {
    console.log(eApproveTxResult);
    throw new Error('failed to approve Token for transfer');
  }

  // use the L1ERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
  console.log(`Sending ${TOKEN_AMOUNT} Tokens from Ethereum...`);
  const eDepositTx = await gatewayContract.deposit(
    fuelAccountAddr,
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
  const depositMessage = await fuels_waitForMessage(
    env.fuel.provider,
    fuelTokenMessageReceiver,
    depositMessageNonce,
    FUEL_MESSAGE_TIMEOUT_MS
  );
  if (depositMessage == null)
    throw new Error(`message took longer than ${FUEL_MESSAGE_TIMEOUT_MS}ms to arrive on Fuel`);

  // relay the message to the target contract
  console.log('Relaying message on Fuel...');
  const fMessageRelayTx = await fuels_relayCommonMessage(fuelAccount, depositMessage, fuelTxParams);
  const fMessageRelayTxResult = await fMessageRelayTx.waitForResult();
  if (fMessageRelayTxResult.status.type !== 'success') {
    console.log(fMessageRelayTxResult);
    throw new Error('failed to relay message from gateway');
  }
  console.log('');

  // the sent Tokens are now spendable on Fuel
  console.log('Tokens were bridged to Fuel successfully!!');

  // note balances of both accounts after transfer
  console.log('Account balances:');
  console.log(
    `  Ethereum - ${ethers_formatToken(await ethTestToken.balanceOf(ethAccountAddr))} Tokens (${ethAccountAddr})`
  );
  console.log(
    `  Fuel - ${fuels_formatToken(await fuelAccount.getBalance(fuelTestTokenId))} Tokens (${fuelAccountAddr})`
  );
  console.log('');

  /////////////////////////////
  // Bridge Fuel -> Ethereum //
  /////////////////////////////

  // withdraw tokens back to the base chain
  console.log(`Sending ${TOKEN_AMOUNT} Tokens from Fuel...`);
  const paddedAddress = '0x' + ethAccountAddr.slice(2).padStart(64, '0');
  const scope = fuelTestToken.functions
    .withdraw_to(paddedAddress)
    .callParams({
      forward: { amount: fuels_parseToken(TOKEN_AMOUNT, 9), assetId: fuelTestTokenId },
    })
    .txParams(fuelTxParams);
  scope.transactionRequest.addMessageOutputs(1);
  const fWithdrawTx = await scope.call();
  const fWithdrawTxResult = fWithdrawTx.transactionResult;
  if (fWithdrawTxResult.status.type !== 'success') {
    console.log(fWithdrawTxResult);
    throw new Error('failed to withdraw tokens to ethereum');
  }

  // get message proof
  console.log('Building message proof...');
  const messageOutReceipt = <TransactionResultMessageOutReceipt>fWithdrawTxResult.receipts[1];
  const withdrawMessageProof = await env.fuel.provider.getMessageProof(
    fWithdrawTx.transactionId,
    messageOutReceipt.messageID
  );
  await delay(20_000); // even though the timelock is 0, we still wait a bit in case the fuel clock is running fast

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

  // the sent Tokens are now spendable on Fuel
  console.log('Tokens were bridged to Ethereum successfully!!');

  // note balances of both accounts after transfer
  console.log('Account balances:');
  console.log(
    `  Ethereum - ${ethers_formatToken(await ethTestToken.balanceOf(ethAccountAddr))} Tokens (${ethAccountAddr})`
  );
  console.log(
    `  Fuel - ${fuels_formatToken(await fuelAccount.getBalance(fuelTestTokenId))} Tokens (${fuelAccountAddr})`
  );
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
