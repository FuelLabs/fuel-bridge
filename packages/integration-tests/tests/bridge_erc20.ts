import type { Token } from '@fuel-bridge/solidity-contracts/typechain';
import type { TestEnvironment } from '@fuel-bridge/test-utils';
import {
  setupEnvironment,
  relayCommonMessage,
  waitForMessage,
  createRelayMessageParams,
  getOrDeployECR20Contract,
  getOrDeployFuelTokenContract,
  FUEL_TX_PARAMS,
  getMessageOutReceipt,
  fuel_to_eth_address,
  waitForBlockCommit,
  waitForBlockFinalization,
  getTokenId,
  getBlock,
  FUEL_CALL_TX_PARAMS,
} from '@fuel-bridge/test-utils';
import chai from 'chai';
import { toBeHex } from 'ethers';
import type { Signer } from 'ethers';
import { Address, BN } from 'fuels';
import type {
  AbstractAddress,
  Contract,
  WalletUnlocked as FuelWallet,
  MessageProof,
} from 'fuels';

const { expect } = chai;

describe('Bridging ERC20 tokens', async function () {
  // Timeout 6 minutes
  const DEFAULT_TIMEOUT_MS: number = 400_000;
  const FUEL_MESSAGE_TIMEOUT_MS: number = 30_000;
  const DECIMAL_DIFF = 1_000_000_000n;

  let env: TestEnvironment;
  let eth_testToken: Token;
  let eth_testTokenAddress: string;
  let eth_erc20GatewayAddress: string;
  let fuel_testToken: Contract;
  let fuel_testContractId: string;
  let fuel_testAssetId: string;

  // override the default test timeout from 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  before(async () => {
    env = await setupEnvironment({});
    eth_erc20GatewayAddress = (
      await env.eth.fuelERC20Gateway.getAddress()
    ).toLowerCase();
    eth_testToken = await getOrDeployECR20Contract(env);
    eth_testTokenAddress = (await eth_testToken.getAddress()).toLowerCase();
    fuel_testToken = await getOrDeployFuelTokenContract(
      env,
      env.eth.fuelERC20Gateway,
      FUEL_TX_PARAMS
    );

    fuel_testContractId = fuel_testToken.id.toHexString();
    await env.eth.fuelERC20Gateway.setAssetIssuerId(fuel_testContractId);
    fuel_testAssetId = getTokenId(fuel_testToken, eth_testTokenAddress);

    const { value: expectedGatewayContractId } = await fuel_testToken.functions
      .bridged_token_gateway()
      .txParams(FUEL_CALL_TX_PARAMS)
      .dryRun();

    // check that values for the test token and gateway contract match what
    // was compiled into the bridge-fungible-token binaries

    expect(fuel_to_eth_address(expectedGatewayContractId)).to.equal(
      eth_erc20GatewayAddress
    );
    expect(await eth_testToken.decimals()).to.equal(18n);

    // mint tokens as starting balances

    await eth_testToken.mint(await env.eth.deployer.getAddress(), 10_000);

    await eth_testToken.mint(await env.eth.signers[0].getAddress(), 10_000);

    await eth_testToken.mint(await env.eth.signers[1].getAddress(), 10_000);
  });

  describe('Bridge ERC20 to Fuel', async () => {
    const NUM_TOKENS = 10_000_000_000n;
    let ethereumTokenSender: Signer;
    let ethereumTokenSenderAddress: string;
    let ethereumTokenSenderBalance: bigint;
    let fuelTokenReceiver: FuelWallet;
    let fuelTokenReceiverAddress: string;
    let fuelTokenReceiverBalance: BN;
    let fuelTokenMessageNonce: BN;
    let fuelTokenMessageReceiver: AbstractAddress;

    before(async () => {
      ethereumTokenSender = env.eth.signers[0];
      ethereumTokenSenderAddress = await ethereumTokenSender.getAddress();
      await eth_testToken.mint(ethereumTokenSenderAddress, NUM_TOKENS);

      ethereumTokenSenderBalance = await eth_testToken.balanceOf(
        ethereumTokenSenderAddress
      );
      fuelTokenReceiver = env.fuel.signers[0];
      fuelTokenReceiverAddress = fuelTokenReceiver.address.toHexString();
      fuelTokenReceiverBalance = await fuelTokenReceiver.getBalance(
        fuel_testAssetId
      );
    });

    it('Bridge ERC20 via FuelERC20Gateway', async () => {
      // approve FuelERC20Gateway to spend the tokens
      await eth_testToken
        .connect(ethereumTokenSender)
        .approve(eth_erc20GatewayAddress, NUM_TOKENS);

      // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
      const tx = await env.eth.fuelERC20Gateway
        .connect(ethereumTokenSender)
        .deposit(fuelTokenReceiverAddress, eth_testTokenAddress, NUM_TOKENS);

      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      // parse events from logs
      const [event, ...restOfEvents] =
        await env.eth.fuelMessagePortal.queryFilter(
          env.eth.fuelMessagePortal.filters.MessageSent,
          receipt.blockNumber,
          receipt.blockNumber
        );
      expect(restOfEvents.length).to.be.eq(0); // Should be only 1 event

      fuelTokenMessageNonce = new BN(event.args.nonce.toString());
      fuelTokenMessageReceiver = Address.fromB256(event.args.recipient);

      // check that the sender balance has decreased by the expected amount
      const newSenderBalance = await eth_testToken.balanceOf(
        ethereumTokenSenderAddress
      );
      expect(newSenderBalance === ethereumTokenSenderBalance - NUM_TOKENS).to.be
        .true;
    });

    it('Relay message from Ethereum on Fuel', async () => {
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
        gasLimit: 30000000,
        maturity: undefined,
      });

      const txResult = await tx.waitForResult();

      expect(txResult.status).to.equal('success');
      expect(txResult.mintedAssets.length).to.equal(1);

      const [mintedAsset] = txResult.mintedAssets;

      expect(mintedAsset.assetId).to.equal(fuel_testAssetId);
      expect(mintedAsset.amount.toString()).to.equal(
        (NUM_TOKENS / DECIMAL_DIFF).toString()
      );
    });

    it('Check metadata was registered', async () => {
      await fuel_testToken.functions
        .asset_to_l1_address({ bits: fuel_testAssetId })
        .call();

      const { value: l2_decimals } = await fuel_testToken.functions
        .decimals({ bits: fuel_testAssetId })
        .get();

      expect(l2_decimals).to.be.equal(9);
    });

    it('Check ERC20 arrived on Fuel', async () => {
      // check that the recipient balance has increased by the expected amount
      const newReceiverBalance = await fuelTokenReceiver.getBalance(
        fuel_testAssetId
      );

      expect(
        newReceiverBalance.eq(
          fuelTokenReceiverBalance.add(toBeHex(NUM_TOKENS / DECIMAL_DIFF))
        )
      ).to.be.true;
    });

    it('Bridge metadata', async () => {
      // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
      const receipt = await env.eth.fuelERC20Gateway
        .connect(ethereumTokenSender)
        .sendMetadata(eth_testTokenAddress)
        .then((tx) => tx.wait());

      // parse events from logs
      const [event, ...restOfEvents] =
        await env.eth.fuelMessagePortal.queryFilter(
          env.eth.fuelMessagePortal.filters.MessageSent,
          receipt.blockNumber,
          receipt.blockNumber
        );
      expect(restOfEvents.length).to.be.eq(0); // Should be only 1 event

      const nonce = new BN(event.args.nonce.toString());
      const fuelReceiver = Address.fromB256(event.args.recipient);

      // relay the message ourselves
      const message = await waitForMessage(
        env.fuel.provider,
        fuelReceiver,
        nonce,
        FUEL_MESSAGE_TIMEOUT_MS
      );
      expect(message).to.not.be.null;

      const tx = await relayCommonMessage(env.fuel.deployer, message, {
        ...FUEL_TX_PARAMS,
        maturity: undefined,
      });

      const txResult = await tx.waitForResult();
      expect(txResult.status).to.equal('success');
    });
  });

  describe('Bridge ERC20 from Fuel', async () => {
    const NUM_TOKENS = 10_000_000_000n;
    let fuelTokenSender: FuelWallet;
    let ethereumTokenReceiver: Signer;
    let ethereumTokenReceiverAddress: string;
    let ethereumTokenReceiverBalance: bigint;
    let withdrawMessageProof: MessageProof;

    before(async () => {
      fuelTokenSender = env.fuel.signers[0];
      ethereumTokenReceiver = env.eth.signers[0];
      ethereumTokenReceiverAddress = await ethereumTokenReceiver.getAddress();
      ethereumTokenReceiverBalance = await eth_testToken.balanceOf(
        ethereumTokenReceiverAddress
      );
    });

    it('Bridge ERC20 via Fuel token contract', async () => {
      // withdraw tokens back to the base chain
      fuel_testToken.account = fuelTokenSender;
      const paddedAddress =
        '0x' + ethereumTokenReceiverAddress.slice(2).padStart(64, '0');
      const fuelTokenSenderBalance = await fuelTokenSender.getBalance(
        fuel_testAssetId
      );
      const transactionRequest = await fuel_testToken.functions
        .withdraw(paddedAddress)
        .txParams({
          tip: 0,
          gasLimit: 1_000_000,
          maxFee: 0,
        })
        .callParams({
          forward: {
            amount: fuelTokenSenderBalance,
            assetId: fuel_testAssetId,
          },
        })
        .fundWithRequiredCoins();

      const tx = await fuelTokenSender.sendTransaction(transactionRequest);
      const fWithdrawTxResult = await tx.waitForResult();
      expect(fWithdrawTxResult.status).to.equal('success');

      // check that the sender balance has decreased by the expected amount
      const newSenderBalance = await fuelTokenSender.getBalance(
        fuel_testAssetId
      );
      expect(
        newSenderBalance.eq(
          fuelTokenSenderBalance.sub(toBeHex(NUM_TOKENS / DECIMAL_DIFF))
        )
      ).to.be.true;

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
    });

    it('Relay Message from Fuel on Ethereum', async () => {
      // wait for block finalization
      await waitForBlockFinalization(env, withdrawMessageProof);

      // construct relay message proof data
      const relayMessageParams = createRelayMessageParams(withdrawMessageProof);

      // relay message

      await env.eth.fuelMessagePortal
        .connect(env.eth.signers[0])
        .relayMessage(
          relayMessageParams.message,
          relayMessageParams.rootBlockHeader,
          relayMessageParams.blockHeader,
          relayMessageParams.blockInHistoryProof,
          relayMessageParams.messageInBlockProof
        );
    });

    it('Check ERC20 arrived on Ethereum', async () => {
      // check that the recipient balance has increased by the expected amount
      const newReceiverBalance = await eth_testToken.balanceOf(
        ethereumTokenReceiverAddress
      );
      expect(newReceiverBalance === ethereumTokenReceiverBalance + NUM_TOKENS)
        .to.be.true;
    });
  });
});
