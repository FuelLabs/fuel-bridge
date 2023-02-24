import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { BigNumber, Signer } from 'ethers';
import { ContractFactory } from '@fuel-ts/contract';
import { join } from 'path';
import { readFileSync } from 'fs';
import { TestEnvironment, setupEnvironment } from '../scripts/setup';
import { Token } from '../fuel-v2-contracts/Token.d';
import { Token__factory } from '../fuel-v2-contracts/factories/Token__factory';
import FuelFungibleTokenContractABI_json from '../bridge-fungible-token/bridge_fungible_token-abi.json';
import {
  AbstractAddress,
  Address,
  BN,
  Contract,
  MessageProof,
  TransactionResultMessageOutReceipt,
  WalletUnlocked as FuelWallet,
} from 'fuels';
import { fuels_relayCommonMessage, fuels_waitForMessage } from '../scripts/utils';

chai.use(solidity);
const { expect } = chai;

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

describe('Bridging ERC20 tokens', async function () {
  const DEFAULT_TIMEOUT_MS: number = 20_000;
  const FUEL_MESSAGE_TIMEOUT_MS: number = 30_000;
  const DECIMAL_DIFF = 1_000_000_000;

  let env: TestEnvironment;
  let eth_testToken: Token;
  let fuel_testToken: Contract;
  let fuel_testTokenId: string;

  // override the default test timeout from 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  before(async () => {
    env = await setupEnvironment({});
  });

  it('Setup tokens to bridge', async () => {
    // TODO: use config time values in sway contracts so we don't have to hardcode
    // these values and can create a new test token contract each time
    const expectedGatewayContractId = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707';
    const expectedTokenContractId = '0x0165878A594ca255338adfa4d48449f69242Eb8F';

    // create test ERC20 contract
    try {
      eth_testToken = Token__factory.connect(expectedTokenContractId, env.eth.deployer);
      await eth_testToken.totalSupply();
    } catch (e) {
      const eth_tokenFactory = new Token__factory(env.eth.deployer);
      eth_testToken = await eth_tokenFactory.deploy();
      await eth_testToken.deployed();
    }

    // check that values for the test token and gateway contract match what
    // was compiled into the bridge-fungible-token binaries
    expect(env.eth.fuelERC20Gateway.address).to.equal(expectedGatewayContractId);
    expect(eth_testToken.address).to.equal(expectedTokenContractId);
    expect(await eth_testToken.decimals()).to.equal(18);

    // mint tokens as starting balances
    await expect(eth_testToken.mint(await env.eth.deployer.getAddress(), 10_000)).to.not.be.reverted;
    await expect(eth_testToken.mint(await env.eth.signers[0].getAddress(), 10_000)).to.not.be.reverted;
    await expect(eth_testToken.mint(await env.eth.signers[1].getAddress(), 10_000)).to.not.be.reverted;

    // setup fuel client and setup l2 side contract for ERC20
    const bytecode = readFileSync(join(__dirname, '../bridge-fungible-token/bridge_fungible_token.bin'));
    const factory = new ContractFactory(bytecode, FuelFungibleTokenContractABI_json, env.fuel.deployer);
    fuel_testToken = await factory.deployContract();
    fuel_testTokenId = fuel_testToken.id.toHexString();
  });

  describe('Bridge ERC20 to Fuel', async () => {
    const NUM_TOKENS = 10_000_000_000;
    let ethereumTokenSender: Signer;
    let ethereumTokenSenderAddress: string;
    let ethereumTokenSenderBalance: BigNumber;
    let fuelTokenReceiver: AbstractAddress;
    let fuelTokenReceiverAddress: string;
    let fuelTokenReceiverBalance: BN;
    let fuelTokenMessageNonce: BN;
    let fuelTokenMessageReceiver: AbstractAddress;
    before(async () => {
      ethereumTokenSender = env.eth.signers[0];
      ethereumTokenSenderAddress = await ethereumTokenSender.getAddress();
      await eth_testToken.mint(ethereumTokenSenderAddress, NUM_TOKENS);
      ethereumTokenSenderBalance = await eth_testToken.balanceOf(ethereumTokenSenderAddress);
      fuelTokenReceiver = env.fuel.signers[0].address;
      fuelTokenReceiverAddress = fuelTokenReceiver.toHexString();
      fuelTokenReceiverBalance = await env.fuel.provider.getBalance(fuelTokenReceiver, fuel_testTokenId);
    });

    it('Bridge ERC20 via FuelERC20Gateway', async () => {
      // approve FuelERC20Gateway to spend the tokens
      await expect(eth_testToken.connect(ethereumTokenSender).approve(env.eth.fuelERC20Gateway.address, NUM_TOKENS)).to
        .not.be.reverted;

      // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
      let tx = await env.eth.fuelERC20Gateway
        .connect(ethereumTokenSender)
        .deposit(fuelTokenReceiverAddress, eth_testToken.address, fuel_testTokenId, NUM_TOKENS);
      let result = await tx.wait();
      expect(result.status).to.equal(1);

      // parse events from logs
      let event = env.eth.fuelMessagePortal.interface.parseLog(result.logs[2]);
      fuelTokenMessageNonce = new BN(event.args.nonce.toHexString());
      fuelTokenMessageReceiver = Address.fromB256(event.args.recipient);

      // check that the sender balance has decreased by the expected amount
      let newSenderBalance = await eth_testToken.balanceOf(ethereumTokenSenderAddress);
      expect(newSenderBalance.eq(ethereumTokenSenderBalance.sub(NUM_TOKENS))).to.be.true;
    });

    it('Relay message from Ethereum on Fuel', async function () {
      // override the default test timeout from 2000ms
      this.timeout(FUEL_MESSAGE_TIMEOUT_MS);

      // relay the message ourselves
      const message = await fuels_waitForMessage(
        env.fuel.provider,
        fuelTokenMessageReceiver,
        fuelTokenMessageNonce,
        FUEL_MESSAGE_TIMEOUT_MS
      );
      expect(message).to.not.be.null;
      const tx = await fuels_relayCommonMessage(env.fuel.deployer, message);
      expect((await tx.waitForResult()).status.type).to.equal('success');
    });

    it('Check ERC20 arrived on Fuel', async () => {
      // check that the recipient balance has increased by the expected amount
      let newReceiverBalance = await env.fuel.provider.getBalance(fuelTokenReceiver, fuel_testTokenId);
      expect(newReceiverBalance.eq(fuelTokenReceiverBalance.add(NUM_TOKENS / DECIMAL_DIFF))).to.be.true;
    });
  });

  describe('Bridge ERC20 from Fuel', async () => {
    const NUM_TOKENS = 10_000_000_000;
    let fuelTokenSender: FuelWallet;
    let fuelTokenSenderAddress: string;
    let fuelTokenSenderBalance: BN;
    let ethereumTokenReceiver: Signer;
    let ethereumTokenReceiverAddress: string;
    let ethereumTokenReceiverBalance: BigNumber;
    let withdrawMessageProof: MessageProof;
    before(async () => {
      fuelTokenSender = env.fuel.signers[0];
      fuelTokenSenderAddress = fuelTokenSender.address.toHexString();
      fuelTokenSenderBalance = await fuelTokenSender.getBalance(fuel_testTokenId);
      ethereumTokenReceiver = env.eth.signers[0];
      ethereumTokenReceiverAddress = await ethereumTokenReceiver.getAddress();
      ethereumTokenReceiverBalance = await eth_testToken.balanceOf(ethereumTokenReceiverAddress);
    });

    it('Bridge ERC20 via Fuel token contract', async () => {
      // withdraw tokens back to the base chain
      fuel_testToken.account = fuelTokenSender;
      const paddedAddress = '0x' + ethereumTokenReceiverAddress.slice(2).padStart(64, '0');
      const scope = await fuel_testToken.functions
        .withdraw(paddedAddress)
        .callParams({
          forward: { amount: NUM_TOKENS / DECIMAL_DIFF, assetId: fuel_testTokenId },
        })
        .fundWithRequiredCoins();
      scope.transactionRequest.addMessageOutputs(1);
      const tx = await fuelTokenSender.sendTransaction(scope.transactionRequest);
      const result = await tx.waitForResult();
      expect(result.status.type).to.equal('success');

      // get message proof
      const messageOutReceipt = <TransactionResultMessageOutReceipt>result.receipts[1];
      withdrawMessageProof = await env.fuel.provider.getMessageProof(tx.id, messageOutReceipt.messageID);

      // check that the sender balance has decreased by the expected amount
      let newSenderBalance = await fuelTokenSender.getBalance(fuel_testTokenId);
      expect(newSenderBalance.eq(fuelTokenSenderBalance.sub(NUM_TOKENS / DECIMAL_DIFF))).to.be.true;
    });

    it('Relay Message from Fuel on Ethereum', async () => {
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

      // relay message
      await expect(
        env.eth.fuelMessagePortal.relayMessageFromFuelBlock(
          messageOutput,
          blockHeader,
          messageInBlockProof,
          withdrawMessageProof.signature
        )
      ).to.not.be.reverted;
    });

    it('Check ERC20 arrived on Ethereum', async () => {
      // check that the recipient balance has increased by the expected amount
      let newReceiverBalance = await eth_testToken.balanceOf(ethereumTokenReceiverAddress);
      expect(newReceiverBalance.eq(ethereumTokenReceiverBalance.add(NUM_TOKENS))).to.be.true;
    });
  });
});
