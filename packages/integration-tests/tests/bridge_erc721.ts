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
  waitForBlockCommit,
  waitForBlockFinalization,
  getTokenId,
  getBlock,
  getOrDeployERC721Contract,
  FUEL_CALL_TX_PARAMS,
} from '@fuel-bridge/test-utils';
import chai from 'chai';
import { zeroPadValue } from 'ethers';
import type { Signer } from 'ethers';
import { Address, BN } from 'fuels';
import type {
  AbstractAddress,
  Contract,
  WalletUnlocked as FuelWallet,
  MessageProof,
} from 'fuels';

const { expect } = chai;

// TODO: develop new version of ERC721 gateway
describe.skip('Bridging ERC721 tokens', async function () {
  // Timeout 6 minutes 40 seconds
  const DEFAULT_TIMEOUT_MS: number = 400_000;
  const FUEL_MESSAGE_TIMEOUT_MS: number = 30_000;

  let env: TestEnvironment;
  let eth_testToken: NFT;
  let eth_testTokenAddress: string;
  let eth_tokenId: string;
  let eth_erc721GatewayAddress: string;
  let fuel_testToken: Contract;
  let fuel_testContractId: string;
  let fuel_testAssetId: string;

  // override the default test timeout from 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  before(async () => {
    env = await setupEnvironment({});
    eth_testToken = await getOrDeployERC721Contract(env);
    eth_testTokenAddress = (await eth_testToken.getAddress()).toLowerCase();
    eth_erc721GatewayAddress = (
      await env.eth.fuelERC721Gateway.getAddress()
    ).toLowerCase();
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
      .txParams(FUEL_CALL_TX_PARAMS)
      .dryRun();
    const { value: expectedGatewayContractId } = await fuel_testToken.functions
      .bridged_token_gateway()
      .txParams(FUEL_CALL_TX_PARAMS)
      .dryRun();

    // check that values for the test token and gateway contract match what
    // was compiled into the bridge-fungible-token binaries
    expect(fuel_to_eth_address(expectedTokenContractId)).to.equal(
      eth_testTokenAddress
    );
    expect(fuel_to_eth_address(expectedGatewayContractId)).to.equal(
      eth_erc721GatewayAddress
    );

    // mint tokens as starting balances

    const deployerAddr = await env.eth.deployer.getAddress();
    await eth_testToken.mint(deployerAddr, deployerAddr);
    const signer0Addr = await env.eth.signers[0].getAddress();
    await eth_testToken.mint(signer0Addr, signer0Addr);
    const signer1Addr = await env.eth.signers[1].getAddress();
    await eth_testToken.mint(signer1Addr, signer1Addr);
  });

  describe('Bridge ERC721 to Fuel', async () => {
    let ethereumTokenSender: Signer;
    let fuelTokenReceiver: FuelWallet;
    let fuelTokenReceiverAddress: string;
    let fuelTokenMessageNonce: BN;
    let fuelTokenMessageReceiver: AbstractAddress;

    before(async () => {
      ethereumTokenSender = env.eth.signers[0];
      fuelTokenReceiver = env.fuel.signers[0];
      fuelTokenReceiverAddress = fuelTokenReceiver.address.toHexString();
      eth_tokenId = zeroPadValue(await ethereumTokenSender.getAddress(), 32);
      fuel_testAssetId = getTokenId(fuel_testToken, eth_tokenId);
    });

    it('Bridge ERC721 via FuelERC721Gateway', async () => {
      // approve FuelERC721Gateway to spend the tokens
      await eth_testToken
        .connect(ethereumTokenSender)
        .approve(env.eth.fuelERC721Gateway, eth_tokenId);

      // use the FuelERC721Gateway to deposit test tokens and receive equivalent tokens on Fuel
      const receipt = await env.eth.fuelERC721Gateway
        .connect(ethereumTokenSender)
        .deposit(
          fuelTokenReceiverAddress,
          eth_testTokenAddress,
          fuel_testContractId,
          eth_tokenId
        )
        .then((tx) => tx.wait());

      expect(receipt.status).to.equal(1);

      const filter = env.eth.fuelMessagePortal.filters.MessageSent(
        null, // Args set to null since there should be just 1 event for MessageSent
        null,
        null,
        null,
        null
      );

      const [event, ...restOfEvents] =
        await env.eth.fuelMessagePortal.queryFilter(
          filter,
          receipt.blockNumber,
          receipt.blockNumber
        );

      expect(restOfEvents.length).to.be.eq(0); // Should be only 1 event

      // parse events from logs
      fuelTokenMessageNonce = new BN(event.args.nonce.toString());
      fuelTokenMessageReceiver = Address.fromB256(event.args.recipient);

      // check that the tokenId now belongs to the gateway
      expect(
        (await eth_testToken.ownerOf(eth_tokenId)).toLowerCase()
      ).to.be.equal(eth_erc721GatewayAddress);
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
      const tx = await relayCommonMessage(env.fuel.deployer, message, {
        ...FUEL_TX_PARAMS,
        maturity: undefined,
      });
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
    let ethereumTokenReceiver: Signer;
    let ethereumTokenReceiverAddress: string;
    let withdrawMessageProof: MessageProof;

    before(async () => {
      fuelTokenSender = env.fuel.signers[0];
      ethereumTokenReceiver = env.eth.signers[1];
      ethereumTokenReceiverAddress = await ethereumTokenReceiver.getAddress();
    });

    it('Bridge ERC721 via Fuel token contract', async () => {
      // withdraw tokens back to the base chain
      fuel_testToken.account = fuelTokenSender;
      const paddedAddress =
        '0x' + ethereumTokenReceiverAddress.slice(2).padStart(64, '0');
      const transactionRequest = await fuel_testToken.functions
        .withdraw(paddedAddress)
        .txParams(FUEL_CALL_TX_PARAMS)
        .callParams({
          forward: {
            amount: 1,
            assetId: fuel_testAssetId,
          },
        })
        .fundWithRequiredCoins();

      const tx = await fuelTokenSender.sendTransaction(transactionRequest);

      const fWithdrawTxResult = await tx.waitForResult();
      expect(fWithdrawTxResult.status).to.equal('success');

      // Wait for the commited block
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
        messageOutReceipt.nonce,
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
