import type { BridgeFungibleToken } from '@fuel-bridge/fungible-token';
import {
  RATE_LIMIT_AMOUNT,
  RATE_LIMIT_DURATION,
} from '@fuel-bridge/solidity-contracts/protocol/constants';
import type {
  Token,
  MockPermitToken,
} from '@fuel-bridge/solidity-contracts/typechain';
import type { TestEnvironment } from '@fuel-bridge/test-utils';
import {
  setupEnvironment,
  relayCommonMessage,
  waitForMessage,
  createRelayMessageParams,
  getOrDeployECR20Contract,
  getOrDeployERC20PermitContract,
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
  let eth_permitTestToken: MockPermitToken;
  let eth_testTokenAddress: string;
  let eth_permitTestTokenAddress: string;
  let eth_erc20GatewayAddress: string;
  let fuel_bridge: BridgeFungibleToken;
  let fuel_bridgeImpl: BridgeFungibleToken;
  let fuel_bridgeContractId: string;
  let fuel_testAssetId: string;
  let fuel_test_permit_token_AssetId: string;

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

  async function relayMessageFromFuel(
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

  async function relayMessageFromEthereum(
    env: TestEnvironment,
    fuelTokenMessageReceiver: AbstractAddress,
    fuelTokenMessageNonce: BN,
    fuel_AssetId: string,
    amount: bigint
  ) {
    // relay the message ourselves
    const message = await waitForMessage(
      env.fuel.provider,
      fuelTokenMessageReceiver,
      fuelTokenMessageNonce,
      FUEL_MESSAGE_TIMEOUT_MS
    );
    expect(message).to.not.be.null;

    const tx = await relayCommonMessage(env.fuel.deployer, message, {
      maturity: undefined,
      contractIds: [fuel_bridgeImpl.id.toHexString()],
    });

    const txResult = await tx.waitForResult();

    expect(txResult.status).to.equal('success');
    expect(txResult.mintedAssets.length).to.equal(1);

    const [mintedAsset] = txResult.mintedAssets;

    expect(mintedAsset.assetId).to.equal(fuel_AssetId);
    expect(mintedAsset.amount.toString()).to.equal(
      (amount / DECIMAL_DIFF).toString()
    );
  }

  async function buildPermitParams(
    name: string,
    tokenAddress: string,
    gatewayAddress: string,
    amount: bigint,
    nonce: bigint,
    deadline: number,
    deployer: Signer
  ) {
    const domain: any = {
      name: name,
      version: '1',
      chainId: env.eth.provider._network.chainId,
      verifyingContract: tokenAddress,
    };

    const types: any = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    const values: any = {
      owner: await deployer.getAddress(),
      spender: gatewayAddress,
      value: amount.toString(),
      nonce: nonce.toString(),
      deadline: deadline.toString(),
    };

    return { domain, types, values };
  }

  function parseSignature(signature: string) {
    signature = signature.startsWith('0x') ? signature.slice(2) : signature;

    // Ensure the signature length is correct
    if (signature.length !== 130) {
      throw new Error('Invalid signature length!');
    }
    // Extract R, S, V
    const r = '0x' + signature.slice(0, 64);
    const s = '0x' + signature.slice(64, 128);
    const v = parseInt(signature.slice(128, 130), 16);
    // Return formatted values
    return {
      r,
      s,
      v,
    };
  }

  before(async () => {
    env = await setupEnvironment({});
    eth_erc20GatewayAddress = (
      await env.eth.fuelERC20Gateway.getAddress()
    ).toLowerCase();

    eth_testToken = await getOrDeployECR20Contract(env);
    eth_permitTestToken = await getOrDeployERC20PermitContract(env);
    eth_testTokenAddress = (await eth_testToken.getAddress()).toLowerCase();
    eth_permitTestTokenAddress = (
      await eth_permitTestToken.getAddress()
    ).toLowerCase();

    const { contract, implementation } = await getOrDeployL2Bridge(
      env,
      env.eth.fuelERC20Gateway
    );

    fuel_bridge = contract;
    fuel_bridgeImpl = implementation;

    fuel_bridgeContractId = fuel_bridge.id.toHexString();

    await env.eth.fuelERC20Gateway.setAssetIssuerId(fuel_bridgeContractId);
    fuel_testAssetId = getTokenId(fuel_bridge, eth_testTokenAddress);

    fuel_test_permit_token_AssetId = getTokenId(
      fuel_bridge,
      eth_permitTestTokenAddress
    );

    // initializing rate limit params for the token
    await env.eth.fuelERC20Gateway
      .connect(env.eth.deployer)
      .resetRateLimitAmount(
        eth_testTokenAddress,
        RATE_LIMIT_AMOUNT.toString(),
        RATE_LIMIT_DURATION
      );

    await env.eth.fuelERC20Gateway
      .connect(env.eth.deployer)
      .updateRateLimitStatus(eth_testTokenAddress, true);

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
    const DEADLINE = Math.floor(Date.now() / 1000) + 600; // 10 mins from current timestamp
    let ethereumTokenSender: Signer;
    let ethereumTokenSenderAddress: string;
    let ethereumTokenSenderBalance: bigint;
    let ethereumPermitTokenSenderBalance: bigint;
    let fuelTokenReceiver: FuelWallet;
    let fuelTokenReceiverAddress: string;
    let fuelTokenReceiverBalance: BN;
    let fuelPermitTokenReceiverBalance: BN;
    let fuelTokenMessageNonce: BN;
    let fuelTokenMessageNonceForPermitToken: BN;
    let fuelTokenMessageReceiver: AbstractAddress;

    before(async () => {
      ethereumTokenSender = env.eth.signers[0];
      ethereumTokenSenderAddress = await ethereumTokenSender.getAddress();

      await eth_testToken
        .mint(ethereumTokenSenderAddress, NUM_TOKENS)
        .then((tx) => tx.wait());

      await eth_permitTestToken
        .mint(ethereumTokenSenderAddress, NUM_TOKENS)
        .then((tx) => tx.wait());

      ethereumTokenSenderBalance = await eth_testToken.balanceOf(
        ethereumTokenSenderAddress
      );
      ethereumPermitTokenSenderBalance = await eth_permitTestToken.balanceOf(
        ethereumTokenSenderAddress
      );
      fuelTokenReceiver = env.fuel.signers[0];
      fuelTokenReceiverAddress = fuelTokenReceiver.address.toHexString();
      fuelTokenReceiverBalance = await fuelTokenReceiver.getBalance(
        fuel_testAssetId
      );
      fuelPermitTokenReceiverBalance = await fuelTokenReceiver.getBalance(
        fuel_test_permit_token_AssetId
      );
    });

    it('Bridge ERC20 token with permit via FuelERC20Gateway', async () => {
      const tokenName = await eth_permitTestToken.name();
      const tokenAddress = await eth_permitTestToken.getAddress();
      const gatewayAddress = await env.eth.fuelERC20Gateway.getAddress();
      const deployerNonce = await eth_permitTestToken.nonces(
        ethereumTokenSender
      );

      const signatureParams = await buildPermitParams(
        tokenName,
        tokenAddress,
        gatewayAddress,
        NUM_TOKENS,
        deployerNonce,
        DEADLINE,
        ethereumTokenSender
      );

      const signature = await ethereumTokenSender.signTypedData(
        signatureParams.domain,
        signatureParams.types,
        signatureParams.values
      );

      const { r, s, v } = parseSignature(signature);
      const permitData = {
        deadline: DEADLINE,
        v,
        r,
        s,
      };

      // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
      const receipt = await env.eth.fuelERC20Gateway
        .connect(ethereumTokenSender)
        .depositWithPermit(
          fuelTokenReceiverAddress,
          eth_permitTestTokenAddress,
          NUM_TOKENS,
          permitData
        )
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

      fuelTokenMessageNonceForPermitToken = new BN(event.args.nonce.toString());

      // check that the sender balance has decreased by the expected amount
      const newSenderBalance = await eth_permitTestToken.balanceOf(
        ethereumTokenSenderAddress
      );
      expect(newSenderBalance === ethereumPermitTokenSenderBalance - NUM_TOKENS)
        .to.be.true;
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

    it('Relay messages from Ethereum on Fuel', async () => {
      // override the default test timeout from 2000ms
      this.timeout(FUEL_MESSAGE_TIMEOUT_MS);
      // relay the standard erc20 deposit
      await relayMessageFromEthereum(
        env,
        fuelTokenMessageReceiver,
        fuelTokenMessageNonce,
        fuel_testAssetId,
        NUM_TOKENS
      );

      // override the default test timeout from 2000ms
      this.timeout(FUEL_MESSAGE_TIMEOUT_MS);
      // relay the erc20 permit token deposit
      await relayMessageFromEthereum(
        env,
        fuelTokenMessageReceiver,
        fuelTokenMessageNonceForPermitToken,
        fuel_test_permit_token_AssetId,
        NUM_TOKENS
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

    it('Check ERC20 permit token arrived on Fuel', async () => {
      // check that the recipient balance has increased by the expected amount
      const newReceiverPermitBalance = await fuelTokenReceiver.getBalance(
        fuel_test_permit_token_AssetId
      );

      expect(
        newReceiverPermitBalance.eq(
          fuelPermitTokenReceiverBalance.add(toBeHex(NUM_TOKENS / DECIMAL_DIFF))
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

      const fuel_name = (
        await fuel_bridge.functions.name({ bits: fuel_testAssetId }).dryRun()
      ).value;
      const fuel_symbol = (
        await fuel_bridge.functions.symbol({ bits: fuel_testAssetId }).dryRun()
      ).value;

      const eth_name = await eth_testToken.name();
      const eth_symbol = await eth_testToken.symbol();

      expect(fuel_name).to.equal(eth_name);
      expect(fuel_symbol).to.equal(eth_symbol);
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
    let tokenBalanceBeforeWithdrawingOnFuel: BN;

    before(async () => {
      fuelTokenSender = env.fuel.signers[0];
      ethereumTokenReceiver = env.eth.signers[0];
      ethereumTokenReceiverAddress = await ethereumTokenReceiver.getAddress();
      ethereumTokenReceiverBalance = await eth_testToken.balanceOf(
        ethereumTokenReceiverAddress
      );

      tokenBalanceBeforeWithdrawingOnFuel = await fuelTokenSender.getBalance(
        fuel_testAssetId
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
      await relayMessageFromFuel(env, withdrawMessageProof);

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

    it('Check the remaining token balance on Fuel after the first withdrawal', async () => {
      // fetch the remaining token balance
      const currentTokenBalance = await fuelTokenSender.getBalance(
        fuel_testAssetId
      );

      // currentTokenBalance has BN type by default hence the use of BN for conversion here
      const expectedRemainingTokenBalanceOnFuel =
        tokenBalanceBeforeWithdrawingOnFuel.sub(
          new BN((NUM_TOKENS / DECIMAL_DIFF).toString())
        );

      expect(currentTokenBalance.eq(expectedRemainingTokenBalanceOnFuel)).to.be
        .true;
    });

    it('Rate limit parameters are updated when current withdrawn amount is more than the new limit & set a new higher limit', async () => {
      const deployer = await env.eth.deployer;
      const newRateLimit = '5';

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

      const currentWitdrawnAmountAfterReset =
        await env.eth.fuelERC20Gateway.currentPeriodAmount(
          eth_testTokenAddress
        );

      expect(currentWitdrawnAmountAfterReset == 0n).to.be.true;

      // withdraw tokens back to the base chain
      withdrawMessageProof = await generateWithdrawalMessageProof(
        fuel_bridge,
        fuelTokenSender,
        ethereumTokenReceiverAddress,
        NUM_TOKENS,
        DECIMAL_DIFF
      );

      // relay message
      await relayMessageFromFuel(env, withdrawMessageProof);

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

    it('Check the remaining token balance on Fuel after the second withdrawal', async () => {
      // fetch the remaining token balance
      const currentTokenBalance = await fuelTokenSender.getBalance(
        fuel_testAssetId
      );

      // currentTokenBalance has BN type by default hence the use of BN for conversion here
      const expectedRemainingTokenBalanceOnFuel =
        tokenBalanceBeforeWithdrawingOnFuel.sub(
          new BN(((NUM_TOKENS * 2n) / DECIMAL_DIFF).toString())
        );

      expect(currentTokenBalance.eq(expectedRemainingTokenBalanceOnFuel)).to.be
        .true;
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
