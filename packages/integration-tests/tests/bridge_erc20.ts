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
  LOG_CONFIG,
  waitForBlockCommit,
  waitForBlockFinalization,
  getTokenId,
  getBlock,
} from '@fuel-bridge/test-utils';
import chai from 'chai';
import type { BigNumber, Signer } from 'ethers';
import { Address, BN, InputType, bn } from 'fuels';
import type {
  AbstractAddress,
  Contract,
  WalletUnlocked as FuelWallet,
  MessageProof,
} from 'fuels';

LOG_CONFIG.debug = false;

const { expect } = chai;

describe('Bridging ERC20 tokens', async function () {
  // Timeout 6 minutes
  const DEFAULT_TIMEOUT_MS: number = 400_000;
  const FUEL_MESSAGE_TIMEOUT_MS: number = 30_000;
  const DECIMAL_DIFF = 1_000_000_000;

  let env: TestEnvironment;
  let eth_testToken: Token;
  let eth_testTokenAddress: string;
  let fuel_testToken: Contract;
  let fuel_testContractId: string;
  let fuel_testAssetId: string;

  // override the default test timeout from 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  before(async () => {
    env = await setupEnvironment({});
    eth_testToken = await getOrDeployECR20Contract(env);
    eth_testTokenAddress = eth_testToken.address.toLowerCase();
    fuel_testToken = await getOrDeployFuelTokenContract(
      env,
      eth_testToken,
      env.eth.fuelERC20Gateway,
      FUEL_TX_PARAMS
    );
    fuel_testContractId = fuel_testToken.id.toHexString();
    fuel_testAssetId = getTokenId(fuel_testToken);

    const { value: expectedTokenContractId } = await fuel_testToken.functions
      .bridged_token()
      .txParams({
        gasLimit: bn(1_000),
        gasPrice: FUEL_TX_PARAMS.gasPrice,
      })
      .dryRun();
    const { value: expectedGatewayContractId } = await fuel_testToken.functions
      .bridged_token_gateway()
      .txParams({
        gasLimit: bn(1_000),
        gasPrice: FUEL_TX_PARAMS.gasPrice,
      })
      .dryRun();

    // check that values for the test token and gateway contract match what
    // was compiled into the bridge-fungible-token binaries
    expect(fuel_to_eth_address(expectedTokenContractId)).to.equal(
      eth_testTokenAddress
    );
    expect(fuel_to_eth_address(expectedGatewayContractId)).to.equal(
      env.eth.fuelERC20Gateway.address.toLowerCase()
    );
    expect(await eth_testToken.decimals()).to.equal(18);

    // mint tokens as starting balances
    await eth_testToken.mint(await env.eth.deployer.getAddress(), 10_000);

    await eth_testToken.mint(await env.eth.signers[0].getAddress(), 10_000);

    await eth_testToken.mint(await env.eth.signers[1].getAddress(), 10_000);
  });

  describe('Bridge ERC20 to Fuel', async () => {
    const NUM_TOKENS = 10_000_000_000;
    let ethereumTokenSender: Signer;
    let ethereumTokenSenderAddress: string;
    let ethereumTokenSenderBalance: BigNumber;
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
        .approve(env.eth.fuelERC20Gateway.address, NUM_TOKENS);

      // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
      const tx = await env.eth.fuelERC20Gateway
        .connect(ethereumTokenSender)
        .deposit(
          fuelTokenReceiverAddress,
          eth_testToken.address,
          fuel_testContractId,
          NUM_TOKENS
        );
      const result = await tx.wait();
      expect(result.status).to.equal(1);

      // parse events from logs
      const event = env.eth.fuelMessagePortal.interface.parseLog(
        result.logs[2]
      );
      fuelTokenMessageNonce = new BN(event.args.nonce.toHexString());
      fuelTokenMessageReceiver = Address.fromB256(event.args.recipient);

      // check that the sender balance has decreased by the expected amount
      const newSenderBalance = await eth_testToken.balanceOf(
        ethereumTokenSenderAddress
      );
      expect(newSenderBalance.eq(ethereumTokenSenderBalance.sub(NUM_TOKENS))).to
        .be.true;
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
      const tx = await relayCommonMessage(env.fuel.deployer, message, { ...FUEL_TX_PARAMS, maturity: undefined });
      expect((await tx.waitForResult()).status).to.equal('success');
    });

    it('Check ERC20 arrived on Fuel', async () => {
      // check that the recipient balance has increased by the expected amount
      const newReceiverBalance = await fuelTokenReceiver.getBalance(
        fuel_testAssetId
      );

      expect(
        newReceiverBalance.eq(
          fuelTokenReceiverBalance.add(NUM_TOKENS / DECIMAL_DIFF)
        )
      ).to.be.true;
    });
  });

  describe('Bridge ERC20 from Fuel', async () => {
    const NUM_TOKENS = 10_000_000_000;
    let fuelTokenSender: FuelWallet;
    let ethereumTokenReceiver: Signer;
    let ethereumTokenReceiverAddress: string;
    let ethereumTokenReceiverBalance: BigNumber;
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
      const scope = await fuel_testToken.functions
        .withdraw(paddedAddress)
        .callParams({
          forward: {
            amount: fuelTokenSenderBalance,
            assetId: fuel_testAssetId,
          },
        });

      const txRequestNotFunded = await scope.getTransactionRequest();

      const { maxFee } =
        await fuelTokenSender.provider.getTransactionCost(txRequestNotFunded);

      const scopeFunded = await scope.fundWithRequiredCoins(maxFee);
      const transactionRequest = await scopeFunded.getTransactionRequest();

      // Remove input messages form the trasaction
      // This is a issue with the current Sway implementation
      // msg_sender().unwrap();
      transactionRequest.inputs = transactionRequest.inputs.filter(
        (i) => i.type !== InputType.Message
      );

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
      expect(
        newSenderBalance.eq(
          fuelTokenSenderBalance.sub(NUM_TOKENS / DECIMAL_DIFF)
        )
      ).to.be.true;
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

    it('Check ERC20 arrived on Ethereum', async () => {
      // check that the recipient balance has increased by the expected amount
      const newReceiverBalance = await eth_testToken.balanceOf(
        ethereumTokenReceiverAddress
      );
      expect(
        newReceiverBalance.eq(ethereumTokenReceiverBalance.add(NUM_TOKENS))
      ).to.be.true;
    });
  });
});
