import { ContractFactory } from '@fuel-ts/contract';
import { join } from 'path';
import { readFileSync } from 'fs';
import { TestEnvironment, setupEnvironment } from '../scripts/setup';
import { Token } from '../fuel-v2-contracts/Token.d';
import { Token__factory } from '../fuel-v2-contracts/factories/Token__factory';
import FuelFungibleTokenContractABI_json from '../bridge-fungible-token/bridge_fungible_token-abi.json';
import { Address, BN, TransactionResultMessageOutReceipt } from 'fuels';
import {
  ethers_formatToken,
  ethers_parseToken,
  fuels_formatToken,
  fuels_parseToken,
  fuels_relayCommonMessage,
  fuels_waitForMessage
} from '../scripts/utils';


const TOKEN_AMOUNT = "10";
const FUEL_MESSAGE_TIMEOUT_MS = 60_000;

// This script is a demonstration of how ERC-20 tokens are bridged to and from the Fuel chain
(async function() {
	// basic setup routine which creates the connections (the "providers") to both chains, 
	// funds addresses for us to test with and populates the official contract deployments 
	// on the Ethereum chain for interacting with the Fuel chain
	console.log("Setting up environment...");
	const env: TestEnvironment = await setupEnvironment({});
	const ethereumAccount = env.eth.signers[1];
	const ethereumAccountAddress = await ethereumAccount.getAddress();
	const fuelAccount = env.fuel.signers[1];
	const fuelAccountAddress = fuelAccount.address.toHexString();
  const fuelMessagePortal = env.eth.fuelMessagePortal.connect(ethereumAccount);
  const gatewayContract = env.eth.l1ERC20Gateway.connect(ethereumAccount);

	////////////////////////////
	// Create Token Contracts //
	////////////////////////////
    // TODO: use config time values in sway contracts so we don't have to hardcode
    // these values and can create a new test token contract each time. These values
    // were taken directly from what was compiled into the fuel fungible-token binary
    const expectedGatewayContractId = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9';
    const expectedTokenContractId = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';
    console.log("Creating token contracts...");
    console.log("");

    // create test ERC20 contract
    let ethTestToken: Token = null;
    try {
      ethTestToken = Token__factory.connect(expectedTokenContractId, env.eth.deployer);
      await ethTestToken.totalSupply();
    } catch (e) {
      const eth_tokenFactory = new Token__factory(env.eth.deployer);
      ethTestToken = await eth_tokenFactory.deploy();
      await ethTestToken.deployed();
    }
    ethTestToken = ethTestToken.connect(ethereumAccount);

    // check that values for the test token and gateway contract match what
    // was compiled into the bridge-fungible-token binaries
    if(gatewayContract.address != expectedGatewayContractId || ethTestToken.address != expectedTokenContractId || (await ethTestToken.decimals()) != 18) {
      throw new Error("failed to connect or create the Ethereum side ERC-20 contract");
    }

    // mint tokens as starting balances
    const tokenMintTx1 = await ethTestToken.mint(await env.eth.deployer.getAddress(), ethers_parseToken("100", 18));
    const tokenMintTx2 = await ethTestToken.mint(await env.eth.signers[0].getAddress(), ethers_parseToken("100", 18));
    const tokenMintTx3 = await ethTestToken.mint(await env.eth.signers[1].getAddress(), ethers_parseToken("100", 18));
    await tokenMintTx1.wait();
    await tokenMintTx2.wait();
    await tokenMintTx3.wait();

    // setup fuel client and setup l2 side contract for ERC20
    const bytecode = readFileSync(
      join(__dirname, '../bridge-fungible-token/bridge_fungible_token.bin')
    );
    const factory = new ContractFactory(
      bytecode,
      FuelFungibleTokenContractABI_json,
      env.fuel.deployer
    );
    const fuelTestToken = await factory.deployContract();
    const fuelTestTokenId = fuelTestToken.id.toHexString();
    fuelTestToken.wallet = fuelAccount;

	/////////////////////////////
	// Bridge Ethereum -> Fuel //
	/////////////////////////////

	// note balances of both accounts before transfer
	console.log("Account balances:");
	console.log("  Ethereum - " + ethers_formatToken(await ethTestToken.balanceOf(ethereumAccountAddress)) + " Tokens (" + ethereumAccountAddress + ")");
	console.log("  Fuel - " + fuels_formatToken(await fuelAccount.getBalance(fuelTestTokenId)) + " Tokens (" + fuelAccountAddress + ")");
	console.log("");

  // approve l1 gateway to spend the tokens
	console.log("Approving Tokens for gateway...");
  const eApproveTx = await ethTestToken.approve(gatewayContract.address, ethers_parseToken(TOKEN_AMOUNT, 18));
	const eApproveTxResult = await eApproveTx.wait();
	if(eApproveTxResult.status !== 1) {
		console.log(eApproveTxResult);
		throw new Error("failed to approve Token for transfer");
	}

  // use the L1ERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
	console.log("Sending " + TOKEN_AMOUNT + " Tokens from Ethereum...");
  const eDepositTx = await gatewayContract.deposit(fuelAccountAddress, ethTestToken.address, fuelTestTokenId, ethers_parseToken(TOKEN_AMOUNT, 18));
  const eDepositTxResult = await eDepositTx.wait();
	if(eDepositTxResult.status !== 1) {
		console.log(eDepositTxResult);
		throw new Error("failed to deposit Token for bridging");
	}

  // parse events from logs
  const event = fuelMessagePortal.interface.parseLog(eDepositTxResult.logs[2]);
  const depositMessageNonce = new BN(event.args.nonce.toHexString());
  const fuelTokenMessageReceiver = Address.fromB256(event.args.recipient);

  // wait for message to arrive on fuel
	console.log("Waiting for message to arrive on Fuel...");
  const depositMessage = await fuels_waitForMessage(env.fuel.provider, fuelTokenMessageReceiver, depositMessageNonce, FUEL_MESSAGE_TIMEOUT_MS);
  if (depositMessage == null)
    throw new Error('message took longer than ' + FUEL_MESSAGE_TIMEOUT_MS + 'ms to arrive on Fuel');

  // relay the message ourselves
  console.log("Relaying message on Fuel...");
  const fMessageRelayTx = await fuels_relayCommonMessage(fuelAccount, depositMessage);
  const fMessageRelayTxResult = await fMessageRelayTx.waitForResult();
  if (fMessageRelayTxResult.status.type !== 'success') {
    console.log(fMessageRelayTxResult);
    throw new Error('failed to relay message from gateway');
  }
  console.log('');

  // the sent Tokens are now spendable on Fuel
  console.log('Tokens were bridged to Fuel successfully!!');

  // note balances of both accounts after transfer
	console.log("Account balances:");
	console.log("  Ethereum - " + ethers_formatToken(await ethTestToken.balanceOf(ethereumAccountAddress)) + " Tokens (" + ethereumAccountAddress + ")");
	console.log("  Fuel - " + fuels_formatToken(await fuelAccount.getBalance(fuelTestTokenId)) + " Tokens (" + fuelAccountAddress + ")");
	console.log("");

  /////////////////////////////
  // Bridge Fuel -> Ethereum //
  /////////////////////////////

  // withdraw tokens back to the base chain
  console.log('Sending ' + TOKEN_AMOUNT + ' Tokens from Fuel...');
  const paddedAddress = '0x' + ethereumAccountAddress.slice(2).padStart(64, '0');
  const scope = await fuelTestToken.functions.withdraw_to(paddedAddress).callParams({
      forward: { amount: fuels_parseToken(TOKEN_AMOUNT, 9), assetId: fuelTestTokenId },
    }).fundWithRequiredCoins();
  scope.transactionRequest.addMessageOutputs(1);
  const fWithdrawTx = await fuelAccount.sendTransaction(scope.transactionRequest);
  const fWithdrawTxResult = await fWithdrawTx.waitForResult();
  if (fWithdrawTxResult.status.type !== 'success') {
    console.log(fWithdrawTxResult);
    throw new Error('failed to withdraw tokens to ethereum');
  }

  // get message proof
  console.log('Building message proof...');
  const messageOutReceipt = <TransactionResultMessageOutReceipt>fWithdrawTxResult.receipts[1];
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

  // the sent Tokens are now spendable on Fuel
  console.log('Tokens were bridged to Ethereum successfully!!');

  // note balances of both accounts after transfer
	console.log("Account balances:");
	console.log("  Ethereum - " + ethers_formatToken(await ethTestToken.balanceOf(ethereumAccountAddress)) + " Tokens (" + ethereumAccountAddress + ")");
	console.log("  Fuel - " + fuels_formatToken(await fuelAccount.getBalance(fuelTestTokenId)) + " Tokens (" + fuelAccountAddress + ")");
	console.log("");

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
