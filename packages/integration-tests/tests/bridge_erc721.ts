import type { NFT } from '@fuel-bridge/solidity-contracts/typechain';
import type { TestEnvironment } from '@fuel-bridge/test-utils';
import {
  setupEnvironment,
  relayCommonMessage,
  waitForMessage,
  createRelayMessageParams,
  getOrDeployFuelTokenContract,
  FUEL_TX_PARAMS,
  getMessageOutReceipt,
  fuel_to_eth_address,
  LOG_CONFIG,
  waitForBlockCommit,
  waitForBlockFinalization,
  getTokenId,
  getBlock,
  getOrDeployERC721Contract,
} from '@fuel-bridge/test-utils';
import chai from 'chai';
import type { Wallet } from 'ethers';
import { BigNumber, utils } from 'ethers';
import { Address, BN, InputType } from 'fuels';
import type {
  AbstractAddress,
  Contract,
  WalletUnlocked as FuelWallet,
  MessageProof,
} from 'fuels';

LOG_CONFIG.debug = false;

const { expect } = chai;

const signerToHexTokenId = (signer: { address: string }) => {
  return utils.hexZeroPad(BigNumber.from(signer.address).toHexString(), 32);
};

describe('Bridging ERC721 tokens', async function () {
  // Timeout 6 minutes 40 seconds
  const DEFAULT_TIMEOUT_MS: number = 400_000;
  const FUEL_MESSAGE_TIMEOUT_MS: number = 30_000;

  let env: TestEnvironment;
  let eth_testToken: NFT;
  let eth_testTokenAddress: string;
  let eth_tokenId: string;
  let fuel_testToken: Contract;
  let fuel_testContractId: string;
  let fuel_testAssetId: string;

  // override the default test timeout from 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  before(async () => {
    env = await setupEnvironment({});
    eth_testToken = await getOrDeployERC721Contract(env);
    eth_testTokenAddress = eth_testToken.address.toLowerCase();
    fuel_testToken = await getOrDeployFuelTokenContract(
      env,
      eth_testToken,
      env.eth.fuelERC721Gateway,
      FUEL_TX_PARAMS,
      0
    );
    fuel_testContractId = fuel_testToken.id.toHexString();

    const { value: expectedTokenContractId } = await fuel_testToken.functions
      .bridged_token()
      .dryRun();
    const { value: expectedGatewayContractId } = await fuel_testToken.functions
      .bridged_token_gateway()
      .dryRun();

    // check that values for the test token and gateway contract match what
    // was compiled into the bridge-fungible-token binaries
    expect(fuel_to_eth_address(expectedTokenContractId)).to.equal(
      eth_testTokenAddress
    );
    expect(fuel_to_eth_address(expectedGatewayContractId)).to.equal(
      env.eth.fuelERC721Gateway.address.toLowerCase()
    );

    // mint tokens as starting balances
    await eth_testToken.mint(
      env.eth.deployer.address,
      env.eth.deployer.address
    );
    await eth_testToken.mint(
      env.eth.signers[0].address,
      env.eth.signers[0].address
    );
    await eth_testToken.mint(
      env.eth.signers[1].address,
      env.eth.signers[1].address
    );
  });

  describe('Bridge ERC721 to Fuel', async () => {
    let ethereumTokenSender: Wallet;
    let fuelTokenReceiver: FuelWallet;
    let fuelTokenReceiverAddress: string;
    let fuelTokenMessageNonce: BN;
    let fuelTokenMessageReceiver: AbstractAddress;

    before(async () => {
      ethereumTokenSender = env.eth.signers[0];
      fuelTokenReceiver = env.fuel.signers[0];
      fuelTokenReceiverAddress = fuelTokenReceiver.address.toHexString();
      eth_tokenId = signerToHexTokenId(ethereumTokenSender);
      fuel_testAssetId = getTokenId(fuel_testToken, eth_tokenId);
    });

    it('Bridge ERC721 via FuelERC721Gateway', async () => {
      // approve FuelERC721Gateway to spend the tokens
      await eth_testToken
        .connect(ethereumTokenSender)
        .approve(env.eth.fuelERC721Gateway.address, eth_tokenId);

      // use the FuelERC721Gateway to deposit test tokens and receive equivalent tokens on Fuel
      const result = await env.eth.fuelERC721Gateway
        .connect(ethereumTokenSender)
        .deposit(
          fuelTokenReceiverAddress,
          eth_testToken.address,
          fuel_testContractId,
          eth_tokenId
        )
        .then((tx) => tx.wait());

      expect(result.status).to.equal(1);

      const filter = env.eth.fuelMessagePortal.filters.MessageSent(
        null, // Args set to null since there should be just 1 event for MessageSent
        null,
        null,
        null,
        null
      );

      const [log, ...rest] = await env.eth.provider.getLogs({
        ...filter,
        fromBlock: result.blockNumber,
        toBlock: result.blockNumber,
      });

      expect(rest.length).to.be.equal(0);

      // parse events from logs
      const event = env.eth.fuelMessagePortal.interface.parseLog(log);
      fuelTokenMessageNonce = new BN(event.args.nonce.toHexString());
      fuelTokenMessageReceiver = Address.fromB256(event.args.recipient);

      // check that the tokenId now belongs to the gateway
      expect(await eth_testToken.ownerOf(eth_tokenId)).to.be.equal(
        env.eth.fuelERC721Gateway.address
      );
    });

    it('Relay message from Ethereum on Fuel', async function () {
      // override the default test timeout from 2000ms
      this.timeout(FUEL_MESSAGE_TIMEOUT_MS);

      // relay the message ourselves
      const message = await waitForMessage(
        env.fuel.provider,
        fuelTokenMessageReceiver,
        fuelTokenMessageNonce,
        FUEL_MESSAGE_TIMEOUT_MS
      );
      expect(message).to.not.be.null;
      const tx = await relayCommonMessage(env.fuel.deployer, message);
      const result = await tx.waitForResult();

      expect(result.status).to.equal('success');
    });

    it('Check ERC721 arrived on Fuel', async () => {
      // check that the recipient balance has increased by the expected amount
      const balance = await fuelTokenReceiver.getBalance(fuel_testAssetId);
      expect(balance.toNumber()).to.be.eq(1);
    });
  });

  describe('Bridge ERC721 from Fuel', async () => {
    let fuelTokenSender: FuelWallet;
    let ethereumTokenReceiver: Wallet;
    let ethereumTokenReceiverAddress: string;
    let withdrawMessageProof: MessageProof;

    before(async () => {
      fuelTokenSender = env.fuel.signers[0];
      ethereumTokenReceiver = env.eth.signers[1];
      ethereumTokenReceiverAddress = ethereumTokenReceiver.address;
    });

    it('Bridge ERC721 via Fuel token contract', async () => {
      // withdraw tokens back to the base chain
      fuel_testToken.account = fuelTokenSender;
      const paddedAddress =
        '0x' + ethereumTokenReceiverAddress.slice(2).padStart(64, '0');
      const scope = await fuel_testToken.functions
        .withdraw(paddedAddress)
        .callParams({
          forward: {
            amount: 1,
            assetId: fuel_testAssetId,
          },
        })
        .fundWithRequiredCoins();

      const transactionRequest = await scope.getTransactionRequest();

      // Remove input messages form the trasaction
      // This is a issue with the current Sway implementation
      // msg_sender().unwrap();
      transactionRequest.inputs = transactionRequest.inputs.filter(
        (i) => i.type !== InputType.Message
      );

      const tx = await fuelTokenSender.sendTransaction(transactionRequest);

      const fWithdrawTxResult = await tx.waitForResult();
      expect(fWithdrawTxResult.status).to.equal('success');

      // Wait for the committed block
      const withdrawBlock = await getBlock(
        env.fuel.provider.url,
        fWithdrawTxResult.blockId
      );
      const commitHashAtL1 = await waitForBlockCommit(
        env,
        withdrawBlock.header.height
      );

      const messageOutReceipt = getMessageOutReceipt(
        fWithdrawTxResult.receipts
      );
      withdrawMessageProof = await fuelTokenSender.provider.getMessageProof(
        tx.id,
        messageOutReceipt.messageId,
        commitHashAtL1
      );

      // check that the sender balance has decreased by the expected amount
      const newSenderBalance = await fuelTokenSender.getBalance(
        fuel_testAssetId
      );
      expect(newSenderBalance.toNumber()).to.be.eq(0);
    });

    it('Relay Message from Fuel on Ethereum', async () => {
      // wait for block finalization
      await waitForBlockFinalization(env, withdrawMessageProof);

      // construct relay message proof data
      const relayMessageParams = createRelayMessageParams(withdrawMessageProof);

      // relay message
      await env.eth.fuelMessagePortal.relayMessage(
        relayMessageParams.message,
        relayMessageParams.rootBlockHeader,
        relayMessageParams.blockHeader,
        relayMessageParams.blockInHistoryProof,
        relayMessageParams.messageInBlockProof
      );
    });

    it('Check ERC721 arrived on Ethereum', async () => {
      // check that the recipient balance has increased by the expected amount
      expect(await eth_testToken.ownerOf(eth_tokenId)).to.be.equal(
        ethereumTokenReceiverAddress
      );
    });
  });
});
