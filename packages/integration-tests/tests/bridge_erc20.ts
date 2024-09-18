import type { BridgeFungibleToken } from '@fuel-bridge/fungible-token';
import {
  RATE_LIMIT_AMOUNT,
  RATE_LIMIT_DURATION,
} from '@fuel-bridge/solidity-contracts/protocol/constants';
import type { Token } from '@fuel-bridge/solidity-contracts/typechain';
import type { TestEnvironment } from '@fuel-bridge/test-utils';
import {
  setupEnvironment,
  relayCommonMessage,
  waitForMessage,
  createRelayMessageParams,
  getOrDeployECR20Contract,
  getOrDeployL2Bridge,
  FUEL_TX_PARAMS,
  getMessageOutReceipt,
  fuel_to_eth_address,
  waitForBlockCommit,
  waitForBlockFinalization,
  getTokenId,
  getBlock,
  FUEL_CALL_TX_PARAMS,
  hardhatSkipTime,
} from '@fuel-bridge/test-utils';
import chai from 'chai';
import { toBeHex, parseEther } from 'ethers';
import type { JsonRpcProvider, Signer } from 'ethers';
import { Address, BN } from 'fuels';
import type {
  AbstractAddress,
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
  let fuel_bridge: BridgeFungibleToken;
  let fuel_bridgeImpl: BridgeFungibleToken;
  let fuel_bridgeContractId: string;
  let fuel_testAssetId: string;

  // override the default test timeout from 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  async function generateWithdrawalMessageProof(
    fuel_bridge: BridgeFungibleToken,
    fuelTokenSender: FuelWallet,
    ethereumTokenReceiverAddress: string,
    NUM_TOKENS: bigint,
    DECIMAL_DIFF: bigint
  ): Promise<MessageProof> {
    // withdraw tokens back to the base chain
    fuel_bridge.account = fuelTokenSender;
    const paddedAddress =
      '0x' + ethereumTokenReceiverAddress.slice(2).padStart(64, '0');
    const fuelTokenSenderBalance = await fuelTokenSender.getBalance(
      fuel_testAssetId
    );
    const transactionRequest = await fuel_bridge.functions
      .withdraw(paddedAddress)
      .addContracts([fuel_bridge, fuel_bridgeImpl])
      .txParams({
        tip: 0,
        gasLimit: 1_000_000,
        maxFee: 1,
      })
      .callParams({
        forward: {
          amount: new BN(NUM_TOKENS.toString()).div(
            new BN(DECIMAL_DIFF.toString())
          ),
          assetId: fuel_testAssetId,
        },
      })
      .fundWithRequiredCoins();

    const tx = await fuelTokenSender.sendTransaction(transactionRequest);
    const fWithdrawTxResult = await tx.waitForResult();
    expect(fWithdrawTxResult.status).to.equal('success');

    // check that the sender balance has decreased by the expected amount
    const newSenderBalance = await fuelTokenSender.getBalance(fuel_testAssetId);

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

    const messageOutReceipt = getMessageOutReceipt(fWithdrawTxResult.receipts);
    return await fuelTokenSender.provider.getMessageProof(
      tx.id,
      messageOutReceipt.nonce,
      commitHashAtL1
    );
  }

  async function relayMessage(
    env: TestEnvironment,
    withdrawMessageProof: MessageProof
  ) {
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
  }

  before(async () => {
    env = await setupEnvironment({});
    eth_erc20GatewayAddress = (
      await env.eth.fuelERC20Gateway.getAddress()
    ).toLowerCase();

    eth_testToken = await getOrDeployECR20Contract(env);
    eth_testTokenAddress = (await eth_testToken.getAddress()).toLowerCase();

    const { contract, implementation } = await getOrDeployL2Bridge(
      env,
      env.eth.fuelERC20Gateway
    );

    fuel_bridge = contract;
    fuel_bridgeImpl = implementation;

    fuel_bridgeContractId = fuel_bridge.id.toHexString();

    await env.eth.fuelERC20Gateway.setAssetIssuerId(fuel_bridgeContractId);
    fuel_testAssetId = getTokenId(fuel_bridge, eth_testTokenAddress);

    // initializing rate limit params for the token
    await env.eth.fuelERC20Gateway
      .connect(env.eth.deployer)
      .resetRateLimitAmount(
        eth_testTokenAddress,
        RATE_LIMIT_AMOUNT.toString(),
        RATE_LIMIT_DURATION
      );

    const { value: expectedGatewayContractId } = await fuel_bridge.functions
      .bridged_token_gateway()
      .addContracts([fuel_bridge, fuel_bridgeImpl])
      .txParams(FUEL_CALL_TX_PARAMS)
      .dryRun();

    // check that values for the test token and gateway contract match what
    // was compiled into the bridge-fungible-token binaries

    expect(fuel_to_eth_address(expectedGatewayContractId)).to.equal(
      eth_erc20GatewayAddress
    );
    expect(await eth_testToken.decimals()).to.equal(18n);

    // mint tokens as starting balances

    await eth_testToken
      .mint(await env.eth.deployer.getAddress(), 10_000)
      .then((tx) => tx.wait());

    await eth_testToken
      .mint(await env.eth.signers[0].getAddress(), 10_000)
      .then((tx) => tx.wait());

    await eth_testToken
      .mint(await env.eth.signers[1].getAddress(), 10_000)
      .then((tx) => tx.wait());
  });

  describe('Bridge ERC20 to Fuel', async () => {
    const NUM_TOKENS = 100000000000000000000n;
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

      await eth_testToken
        .mint(ethereumTokenSenderAddress, NUM_TOKENS)
        .then((tx) => tx.wait());

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
        .approve(eth_erc20GatewayAddress, NUM_TOKENS)
        .then((tx) => tx.wait());

      // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
      const receipt = await env.eth.fuelERC20Gateway
        .connect(ethereumTokenSender)
        .deposit(fuelTokenReceiverAddress, eth_testTokenAddress, NUM_TOKENS)
        .then((tx) => tx.wait());

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
        contractIds: [fuel_bridgeImpl.id.toHexString()],
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
      await fuel_bridge.functions
        .asset_to_l1_address({ bits: fuel_testAssetId })
        .addContracts([fuel_bridge, fuel_bridgeImpl])
        .call();

      const { value: l2_decimals } = await fuel_bridge.functions
        .decimals({ bits: fuel_testAssetId })
        .addContracts([fuel_bridge, fuel_bridgeImpl])
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
        contractIds: [fuel_bridgeImpl.id.toHexString()],
      });

      const txResult = await tx.waitForResult();
      expect(txResult.status).to.equal('success');
    });
  });

  describe('Bridge ERC20 from Fuel', async () => {
    const NUM_TOKENS = 10000000000000000000n;
    const largeRateLimit = `30`;
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
      withdrawMessageProof = await generateWithdrawalMessageProof(
        fuel_bridge,
        fuelTokenSender,
        ethereumTokenReceiverAddress,
        NUM_TOKENS,
        DECIMAL_DIFF
      );
    });

    it('Relay Message from Fuel on Ethereum', async () => {
      const withdrawnAmountBeforeRelay =
        await env.eth.fuelERC20Gateway.currentPeriodAmount(
          eth_testTokenAddress
        );

      const rateLimitEndDuratioBeforeRelay =
        await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);

      // relay message
      await relayMessage(env, withdrawMessageProof);

      // check rate limit params
      const withdrawnAmountAfterRelay =
        await env.eth.fuelERC20Gateway.currentPeriodAmount(
          eth_testTokenAddress
        );

      const rateLimitEndDuratioAfterRelay =
        await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);

      expect(rateLimitEndDuratioAfterRelay === rateLimitEndDuratioBeforeRelay)
        .to.be.true;

      expect(
        withdrawnAmountAfterRelay === NUM_TOKENS + withdrawnAmountBeforeRelay
      ).to.be.true;
    });

    it('Rate limit parameters are updated when current withdrawn amount is more than the new limit & set a new higher limit', async () => {
      const deployer = await env.eth.deployer;
      let newRateLimit = '5';

      let withdrawnAmountBeforeReset =
        await env.eth.fuelERC20Gateway.currentPeriodAmount(
          eth_testTokenAddress
        );

      await env.eth.fuelERC20Gateway
        .connect(deployer)
        .resetRateLimitAmount(
          eth_testTokenAddress,
          parseEther(newRateLimit),
          RATE_LIMIT_DURATION
        );

      let currentWithdrawnAmountAfterSettingLimit =
        await env.eth.fuelERC20Gateway.currentPeriodAmount(
          eth_testTokenAddress
        );

      // current withdrawn amount doesn't change when rate limit is updated

      expect(
        currentWithdrawnAmountAfterSettingLimit === withdrawnAmountBeforeReset
      ).to.be.true;

      withdrawnAmountBeforeReset =
        await env.eth.fuelERC20Gateway.currentPeriodAmount(
          eth_testTokenAddress
        );

      await env.eth.fuelERC20Gateway
        .connect(deployer)
        .resetRateLimitAmount(
          eth_testTokenAddress,
          parseEther(largeRateLimit),
          RATE_LIMIT_DURATION
        );

      currentWithdrawnAmountAfterSettingLimit =
        await env.eth.fuelERC20Gateway.currentPeriodAmount(
          eth_testTokenAddress
        );

      expect(
        currentWithdrawnAmountAfterSettingLimit === withdrawnAmountBeforeReset
      ).to.be.true;
    });

    it('Rate limit parameters are updated when the initial duration is over', async () => {
      const deployer = await env.eth.deployer;

      const rateLimitDuration =
        await env.eth.fuelERC20Gateway.rateLimitDuration(eth_testTokenAddress);

      // fast forward time
      await hardhatSkipTime(
        env.eth.provider as JsonRpcProvider,
        rateLimitDuration * 2n
      );
      const currentPeriodEndBeforeRelay =
        await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);

      await env.eth.fuelERC20Gateway
        .connect(deployer)
        .resetRateLimitAmount(
          eth_testTokenAddress,
          parseEther(largeRateLimit),
          RATE_LIMIT_DURATION
        );

      // withdraw tokens back to the base chain
      withdrawMessageProof = await generateWithdrawalMessageProof(
        fuel_bridge,
        fuelTokenSender,
        ethereumTokenReceiverAddress,
        NUM_TOKENS,
        DECIMAL_DIFF
      );

      // relay message
      await relayMessage(env, withdrawMessageProof);

      const currentPeriodEndAfterRelay =
        await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);

      expect(currentPeriodEndAfterRelay > currentPeriodEndBeforeRelay).to.be
        .true;

      const currentPeriodAmount =
        await env.eth.fuelERC20Gateway.currentPeriodAmount(
          eth_testTokenAddress
        );

      expect(currentPeriodAmount === NUM_TOKENS).to.be.true;
    });

    it('Rate limit parameters are updated when new limit is set after the initial duration', async () => {
      const rateLimitDuration =
        await env.eth.fuelERC20Gateway.rateLimitDuration(eth_testTokenAddress);

      const deployer = await env.eth.deployer;
      const newRateLimit = `40`;

      // fast forward time
      await hardhatSkipTime(
        env.eth.provider as JsonRpcProvider,
        rateLimitDuration * 2n
      );

      const currentWithdrawnAmountBeforeSettingLimit =
        await env.eth.fuelERC20Gateway.currentPeriodAmount(
          eth_testTokenAddress
        );
      const currentPeriodEndBeforeSettingLimit =
        await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);

      await env.eth.fuelERC20Gateway
        .connect(deployer)
        .resetRateLimitAmount(
          eth_testTokenAddress,
          parseEther(newRateLimit),
          RATE_LIMIT_DURATION
        );

      const currentPeriodEndAfterSettingLimit =
        await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);
      const currentWithdrawnAmountAfterSettingLimit =
        await env.eth.fuelERC20Gateway.currentPeriodAmount(
          eth_testTokenAddress
        );

      expect(
        currentPeriodEndAfterSettingLimit > currentPeriodEndBeforeSettingLimit
      ).to.be.true;

      expect(
        currentWithdrawnAmountBeforeSettingLimit >
          currentWithdrawnAmountAfterSettingLimit
      ).to.be.true;

      expect(currentWithdrawnAmountAfterSettingLimit === 0n).to.be.true;
    });

    it('Check ERC20 arrived on Ethereum', async () => {
      // check that the recipient balance has increased by the expected amount
      const newReceiverBalance = await eth_testToken.balanceOf(
        ethereumTokenReceiverAddress
      );
      expect(
        newReceiverBalance === ethereumTokenReceiverBalance + NUM_TOKENS * 2n
      ).to.be.true;
    });
  });
});
