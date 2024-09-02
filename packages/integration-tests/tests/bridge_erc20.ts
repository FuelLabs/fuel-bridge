import type { BridgeFungibleToken } from '@fuel-bridge/fungible-token';
import {
  RATE_LIMIT_AMOUNT,
  RATE_LIMIT_DURATION,
} from '@fuel-bridge/solidity-contracts/protocol/constants';
import {
  CustomToken,
  CustomTokenWETH,
  CustomToken__factory,
  CustomTokenWETH__factory,
} from '@fuel-bridge/solidity-contracts/typechain';
import type { TestEnvironment } from '@fuel-bridge/test-utils';
import {
  setupEnvironment,
  relayCommonMessage,
  waitForMessage,
  createRelayMessageParams,
  getOrDeployCustomTokenContract,
  getOrDeployCustomWETHContract,
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
  const USDT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';
  const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const WBTC_ADDRESS = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
  const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

  const customTokens: CustomToken[] = [];
  const fuelAssetId: string[] = [];
  const decimals: bigint[] = [];

  let env: TestEnvironment;
  let weth_testToken: CustomTokenWETH;

  let eth_erc20GatewayAddress: string;
  let fuel_bridge: BridgeFungibleToken;
  let fuel_bridgeImpl: BridgeFungibleToken;
  let fuel_bridgeContractId: string;

  // override the default test timeout from 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  // async function generateWithdrawalMessageProof(
  //   fuel_bridge: BridgeFungibleToken,
  //   fuelTokenSender: FuelWallet,
  //   ethereumTokenReceiverAddress: string,
  //   NUM_TOKENS: bigint,
  //   DECIMAL_DIFF: bigint
  // ): Promise<MessageProof> {
  //   // withdraw tokens back to the base chain
  //   fuel_bridge.account = fuelTokenSender;
  //   const paddedAddress =
  //     '0x' + ethereumTokenReceiverAddress.slice(2).padStart(64, '0');
  //   const fuelTokenSenderBalance = await fuelTokenSender.getBalance(
  //     fuel_testAssetId
  //   );
  //   const transactionRequest = await fuel_bridge.functions
  //     .withdraw(paddedAddress)
  //     .addContracts([fuel_bridge, fuel_bridgeImpl])
  //     .txParams({
  //       tip: 0,
  //       gasLimit: 1_000_000,
  //       maxFee: 1,
  //     })
  //     .callParams({
  //       forward: {
  //         amount: new BN(NUM_TOKENS.toString()).div(
  //           new BN(DECIMAL_DIFF.toString())
  //         ),
  //         assetId: fuel_testAssetId,
  //       },
  //     })
  //     .fundWithRequiredCoins();

  //   const tx = await fuelTokenSender.sendTransaction(transactionRequest);
  //   const fWithdrawTxResult = await tx.waitForResult();
  //   expect(fWithdrawTxResult.status).to.equal('success');

  //   // check that the sender balance has decreased by the expected amount
  //   const newSenderBalance = await fuelTokenSender.getBalance(fuel_testAssetId);

  //   expect(
  //     newSenderBalance.eq(
  //       fuelTokenSenderBalance.sub(toBeHex(NUM_TOKENS / DECIMAL_DIFF))
  //     )
  //   ).to.be.true;

  //   // Wait for the commited block
  //   const withdrawBlock = await getBlock(
  //     env.fuel.provider.url,
  //     fWithdrawTxResult.blockId
  //   );
  //   const commitHashAtL1 = await waitForBlockCommit(
  //     env,
  //     withdrawBlock.header.height
  //   );

  //   const messageOutReceipt = getMessageOutReceipt(fWithdrawTxResult.receipts);
  //   return await fuelTokenSender.provider.getMessageProof(
  //     tx.id,
  //     messageOutReceipt.nonce,
  //     commitHashAtL1
  //   );
  // }

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

    let usdt_testToken = await getOrDeployCustomTokenContract(env, 6n);
    let usdc_testToken = await getOrDeployCustomTokenContract(env, 6n);
    let wbtc_testToken = await getOrDeployCustomTokenContract(env, 8n);
    weth_testToken = await getOrDeployCustomWETHContract(env);

    // Get the runtime bytecode.
    const runtimeBytecodeUSDTToken: string = await env.eth.provider.getCode(
      await usdt_testToken.getAddress()
    );
    const runtimeBytecodeUSDCToken: string = await env.eth.provider.getCode(
      await usdc_testToken.getAddress()
    );
    const runtimeBytecodeWBTCToken: string = await env.eth.provider.getCode(
      await wbtc_testToken.getAddress()
    );
    const runtimeBytecodeWETHToken: string = await env.eth.provider.getCode(
      await weth_testToken.getAddress()
    );

    // set code for mainnet addresses
    await env.eth.provider.send('hardhat_setCode', [
      USDT_ADDRESS,
      runtimeBytecodeUSDTToken,
    ]);
    await env.eth.provider.send('hardhat_setCode', [
      USDC_ADDRESS,
      runtimeBytecodeUSDCToken,
    ]);
    await env.eth.provider.send('hardhat_setCode', [
      WBTC_ADDRESS,
      runtimeBytecodeWBTCToken,
    ]);
    await env.eth.provider.send('hardhat_setCode', [
      WETH_ADDRESS,
      runtimeBytecodeWETHToken,
    ]);

    usdt_testToken = CustomToken__factory.connect(
      USDT_ADDRESS,
      env.eth.deployer
    );
    usdc_testToken = CustomToken__factory.connect(
      USDC_ADDRESS,
      env.eth.deployer
    );
    wbtc_testToken = CustomToken__factory.connect(
      WBTC_ADDRESS,
      env.eth.deployer
    );
    weth_testToken = CustomTokenWETH__factory.connect(
      WETH_ADDRESS,
      env.eth.deployer
    );

    customTokens.push(usdt_testToken);
    customTokens.push(usdc_testToken);
    customTokens.push(wbtc_testToken);

    decimals.push(6n);
    decimals.push(6n);
    decimals.push(8n);

    const { contract, implementation } = await getOrDeployL2Bridge(
      env,
      env.eth.fuelERC20Gateway
    );

    fuel_bridge = contract;
    fuel_bridgeImpl = implementation;

    fuel_bridgeContractId = fuel_bridge.id.toHexString();

    await env.eth.fuelERC20Gateway.setAssetIssuerId(fuel_bridgeContractId);

    fuelAssetId.push(getTokenId(fuel_bridge, USDT_ADDRESS));
    fuelAssetId.push(getTokenId(fuel_bridge, USDC_ADDRESS));
    fuelAssetId.push(getTokenId(fuel_bridge, WBTC_ADDRESS));
    fuelAssetId.push(getTokenId(fuel_bridge, WETH_ADDRESS));

    // initializing rate limit params for the token
    await env.eth.fuelERC20Gateway
      .connect(env.eth.deployer)
      .resetRateLimitAmount(
        WETH_ADDRESS,
        RATE_LIMIT_AMOUNT.toString(),
        RATE_LIMIT_DURATION
      );

    for (let i = 0; i < decimals.length; i++) {
      let rateLimitAmount =
        BigInt(RATE_LIMIT_AMOUNT) / 10n ** (18n - decimals[i]);
      await env.eth.fuelERC20Gateway
        .connect(env.eth.deployer)
        .resetRateLimitAmount(
          await customTokens[i].getAddress(),
          rateLimitAmount.toString(),
          RATE_LIMIT_DURATION
        );
    }

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
  });

  describe('Bridge ERC20 to Fuel', async () => {
    const NUM_TOKENS = 100000000000000000000n;
    let ethereumTokenSender: Signer;
    let ethereumTokenSenderAddress: string;
    let ethereumTokenSenderBalance: bigint[] = [];
    let fuelTokenReceiver: FuelWallet;
    let fuelTokenReceiverAddress: string;
    let fuelTokenReceiverBalance: BN[] = [];
    let fuelTokenMessageNonce: BN;
    let fuelTokenMessageReceiver: AbstractAddress;

    before(async () => {
      ethereumTokenSender = env.eth.signers[0];
      ethereumTokenSenderAddress = await ethereumTokenSender.getAddress();

      for (let i = 0; i < decimals.length; i++) {
        let mintAmount = BigInt(NUM_TOKENS) / 10n ** (18n - decimals[i]);
        await customTokens[i]
          .mint(ethereumTokenSender, mintAmount)
          .then((tx) => tx.wait());

        ethereumTokenSenderBalance.push(
          await customTokens[i].balanceOf(ethereumTokenSenderAddress)
        );
      }

      await weth_testToken
        .connect(ethereumTokenSender)
        .deposit({ value: parseEther('10') });

      ethereumTokenSenderBalance.push(
        await weth_testToken.balanceOf(ethereumTokenSenderAddress)
      );

      fuelTokenReceiver = env.fuel.signers[0];
      fuelTokenReceiverAddress = fuelTokenReceiver.address.toHexString();
      for (let i = 0; i < fuelAssetId.length; i++) {
        fuelTokenReceiverBalance.push(
          await fuelTokenReceiver.getBalance(fuelAssetId[i])
        );
      }
    });

    it('Bridge ERC20 via FuelERC20Gateway', async () => {
      // approve FuelERC20Gateway to spend the tokens

      for (let i = 0; i < decimals.length; i++) {
        let approveAmount = BigInt(NUM_TOKENS) / 10n ** (18n - decimals[i]);

        await customTokens[i]
          .connect(ethereumTokenSender)
          .approve(eth_erc20GatewayAddress, approveAmount)
          .then((tx) => tx.wait());
      }

      await weth_testToken
        .connect(ethereumTokenSender)
        .approve(eth_erc20GatewayAddress, NUM_TOKENS)
        .then((tx) => tx.wait());

      // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
      let receipt;
      for (let i = 0; i < decimals.length; i++) {
        let depositAmount = BigInt(NUM_TOKENS) / 10n ** (18n - decimals[i]);

        receipt = await env.eth.fuelERC20Gateway
          .connect(ethereumTokenSender)
          .deposit(
            fuelTokenReceiverAddress,
            await customTokens[i].getAddress(),
            depositAmount
          )
          .then((tx) => tx.wait());
      }
      receipt = await env.eth.fuelERC20Gateway
        .connect(ethereumTokenSender)
        .deposit(
          fuelTokenReceiverAddress,
          await weth_testToken.getAddress(),
          parseEther('10')
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

      fuelTokenMessageNonce = new BN(event.args.nonce.toString());
      fuelTokenMessageReceiver = Address.fromB256(event.args.recipient);

      let newSenderBalance;

      // check that the sender balance has decreased by the expected amount
      for (let i = 0; i < decimals.length; i++) {
        newSenderBalance = await customTokens[i].balanceOf(
          ethereumTokenSenderAddress
        );
        expect(
          newSenderBalance ===
            ethereumTokenSenderBalance[i] -
              BigInt(NUM_TOKENS) / 10n ** (18n - decimals[i])
        ).to.be.true;
      }

      newSenderBalance = await weth_testToken.balanceOf(
        ethereumTokenSenderAddress
      );

      expect(newSenderBalance === 0n).to.be.true;
    });

    it('Relay message from Ethereum on Fuel', async () => {
      // override the default test timeout from 2000ms
      this.timeout(FUEL_MESSAGE_TIMEOUT_MS);

      // relay the message ourselves
      for (let i = 0; i < fuelAssetId.length; i++) {
        let message = await waitForMessage(
          env.fuel.provider,
          fuelTokenMessageReceiver,
          new BN(i),
          FUEL_MESSAGE_TIMEOUT_MS
        );
        expect(message).to.not.be.null;

        let tx = await relayCommonMessage(env.fuel.deployer, message, {
          gasLimit: 30000000,
          maturity: undefined,
          contractIds: [fuel_bridgeImpl.id.toHexString()],
        });

        const txResult = await tx.waitForResult();

        expect(txResult.status).to.equal('success');
        expect(txResult.mintedAssets.length).to.equal(1);

        const [mintedAsset] = txResult.mintedAssets;

        expect(mintedAsset.assetId).to.equal(fuelAssetId[i]);
        if (i == fuelAssetId.length - 1) {
          expect(mintedAsset.amount.toString()).to.equal(
            (parseEther('10') / DECIMAL_DIFF).toString()
          );
        } else {
          expect(mintedAsset.amount.toString()).to.equal(
            (
              NUM_TOKENS /
              DECIMAL_DIFF /
              (DECIMAL_DIFF / 10n ** decimals[i])
            ).toString()
          );
        }
      }
    });

    it('Check metadata was registered', async () => {
      for (let i = 0; i < fuelAssetId.length; i++) {
        await fuel_bridge.functions
          .asset_to_l1_address({ bits: fuelAssetId[i] })
          .addContracts([fuel_bridge, fuel_bridgeImpl])
          .call();
        const { value: l2_decimals } = await fuel_bridge.functions
          .decimals({ bits: fuelAssetId[i] })
          .addContracts([fuel_bridge, fuel_bridgeImpl])
          .get();
        expect(l2_decimals).to.be.equal(9);
      }
    });

    it('Check ERC20 arrived on Fuel', async () => {
      for (let i = 0; i < fuelAssetId.length; i++) {
        // check that the recipient balance has increased by the expected amount
        const newReceiverBalance = await fuelTokenReceiver.getBalance(
          fuelAssetId[i]
        );
        if (i == fuelAssetId.length - 1) {
          expect(
            newReceiverBalance.eq(
              fuelTokenReceiverBalance[i].add(
                toBeHex(NUM_TOKENS / DECIMAL_DIFF)
              )
            )
          ).to.be.true;
        } else {
          expect(
            newReceiverBalance.eq(
              fuelTokenReceiverBalance[i].add(
                toBeHex(
                  NUM_TOKENS /
                    DECIMAL_DIFF /
                    (DECIMAL_DIFF / 10n ** decimals[i])
                )
              )
            )
          ).to.be.true;
        }
      }
    });

    it('Bridge metadata', async () => {
      // TODO: ADD WETH
      for (let i = 0; i < fuelAssetId.length; i++) {
        // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
        const receipt = await env.eth.fuelERC20Gateway
          .connect(ethereumTokenSender)
          .sendMetadata(await customTokens[i].getAddress())
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
      }
    });
  });
});

// describe('Bridge ERC20 from Fuel', async () => {
//   const NUM_TOKENS = 10000000000000000000n;
//   let fuelTokenSender: FuelWallet;
//   let ethereumTokenReceiver: Signer;
//   let ethereumTokenReceiverAddress: string;
//   let ethereumTokenReceiverBalance: bigint;
//   let withdrawMessageProof: MessageProof;

//   before(async () => {
//     fuelTokenSender = env.fuel.signers[0];
//     ethereumTokenReceiver = env.eth.signers[0];
//     ethereumTokenReceiverAddress = await ethereumTokenReceiver.getAddress();
//     ethereumTokenReceiverBalance = await eth_testToken.balanceOf(
//       ethereumTokenReceiverAddress
//     );
//   });

//   it('Bridge ERC20 via Fuel token contract', async () => {
//     // withdraw tokens back to the base chain
//     withdrawMessageProof = await generateWithdrawalMessageProof(
//       fuel_bridge,
//       fuelTokenSender,
//       ethereumTokenReceiverAddress,
//       NUM_TOKENS,
//       DECIMAL_DIFF
//     );
//   });

//   it('Relay Message from Fuel on Ethereum', async () => {
//     const withdrawnAmountBeforeRelay =
//       await env.eth.fuelERC20Gateway.currentPeriodAmount(
//         eth_testTokenAddress
//       );

//     const rateLimitEndDuratioBeforeRelay =
//       await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);

//     // relay message
//     await relayMessage(env, withdrawMessageProof);

//     // check rate limit params
//     const withdrawnAmountAfterRelay =
//       await env.eth.fuelERC20Gateway.currentPeriodAmount(
//         eth_testTokenAddress
//       );

//     const rateLimitEndDuratioAfterRelay =
//       await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);

//     expect(rateLimitEndDuratioAfterRelay === rateLimitEndDuratioBeforeRelay)
//       .to.be.true;

//     expect(
//       withdrawnAmountAfterRelay === NUM_TOKENS + withdrawnAmountBeforeRelay
//     ).to.be.true;
//   });

//   it('Rate limit parameters are updated when current withdrawn amount is more than the new limit', async () => {
//     const deployer = await env.eth.deployer;
//     const newRateLimit = '5';

//     await env.eth.fuelERC20Gateway
//       .connect(deployer)
//       .resetRateLimitAmount(
//         eth_testTokenAddress,
//         parseEther(newRateLimit),
//         RATE_LIMIT_DURATION
//       );

//     const currentWithdrawnAmountAfterSettingLimit =
//       await env.eth.fuelERC20Gateway.currentPeriodAmount(
//         eth_testTokenAddress
//       );

//     expect(
//       currentWithdrawnAmountAfterSettingLimit === parseEther(newRateLimit)
//     ).to.be.true;
//   });

//   it('Rate limit parameters are updated when the initial duration is over', async () => {
//     const deployer = await env.eth.deployer;
//     const newRateLimit = `30`;

//     const rateLimitDuration =
//       await env.eth.fuelERC20Gateway.rateLimitDuration(eth_testTokenAddress);

//     // fast forward time
//     await hardhatSkipTime(
//       env.eth.provider as JsonRpcProvider,
//       rateLimitDuration * 2n
//     );
//     const currentPeriodEndBeforeRelay =
//       await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);

//     await env.eth.fuelERC20Gateway
//       .connect(deployer)
//       .resetRateLimitAmount(
//         eth_testTokenAddress,
//         parseEther(newRateLimit),
//         RATE_LIMIT_DURATION
//       );

//     // withdraw tokens back to the base chain
//     withdrawMessageProof = await generateWithdrawalMessageProof(
//       fuel_bridge,
//       fuelTokenSender,
//       ethereumTokenReceiverAddress,
//       NUM_TOKENS,
//       DECIMAL_DIFF
//     );

//     // relay message
//     await relayMessage(env, withdrawMessageProof);

//     const currentPeriodEndAfterRelay =
//       await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);

//     expect(currentPeriodEndAfterRelay > currentPeriodEndBeforeRelay).to.be
//       .true;

//     const currentPeriodAmount =
//       await env.eth.fuelERC20Gateway.currentPeriodAmount(
//         eth_testTokenAddress
//       );

//     expect(currentPeriodAmount === NUM_TOKENS).to.be.true;
//   });

//   it('Rate limit parameters are updated when new limit is set after the initial duration', async () => {
//     const rateLimitDuration =
//       await env.eth.fuelERC20Gateway.rateLimitDuration(eth_testTokenAddress);

//     const deployer = await env.eth.deployer;
//     const newRateLimit = `40`;

//     // fast forward time
//     await hardhatSkipTime(
//       env.eth.provider as JsonRpcProvider,
//       rateLimitDuration * 2n
//     );

//     const currentWithdrawnAmountBeforeSettingLimit =
//       await env.eth.fuelERC20Gateway.currentPeriodAmount(
//         eth_testTokenAddress
//       );
//     const currentPeriodEndBeforeSettingLimit =
//       await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);

//     await env.eth.fuelERC20Gateway
//       .connect(deployer)
//       .resetRateLimitAmount(
//         eth_testTokenAddress,
//         parseEther(newRateLimit),
//         RATE_LIMIT_DURATION
//       );

//     const currentPeriodEndAfterSettingLimit =
//       await env.eth.fuelERC20Gateway.currentPeriodEnd(eth_testTokenAddress);
//     const currentWithdrawnAmountAfterSettingLimit =
//       await env.eth.fuelERC20Gateway.currentPeriodAmount(
//         eth_testTokenAddress
//       );

//     expect(
//       currentPeriodEndAfterSettingLimit > currentPeriodEndBeforeSettingLimit
//     ).to.be.true;

//     expect(
//       currentWithdrawnAmountBeforeSettingLimit >
//         currentWithdrawnAmountAfterSettingLimit
//     ).to.be.true;

//     expect(currentWithdrawnAmountAfterSettingLimit === 0n).to.be.true;
//   });

//   it('Check ERC20 arrived on Ethereum', async () => {
//     // check that the recipient balance has increased by the expected amount
//     const newReceiverBalance = await eth_testToken.balanceOf(
//       ethereumTokenReceiverAddress
//     );
//     expect(
//       newReceiverBalance === ethereumTokenReceiverBalance + NUM_TOKENS * 2n
//     ).to.be.true;
//   });
// });
