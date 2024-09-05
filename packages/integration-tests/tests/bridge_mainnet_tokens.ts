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
import {
  USDT_ADDRESS,
  USDC_ADDRESS,
  WBTC_ADDRESS,
  WETH_ADDRESS,
} from '@fuel-bridge/solidity-contracts/protocol/constants';
// import set_canonical_token_bytecode from '@fuel-bridge/solidity-contracts/deploy/hardhat/helpers/set_canonical_token_bytecode';
import type { TestEnvironment } from '@fuel-bridge/test-utils';
import {
  setupEnvironment,
  relayCommonMessage,
  waitForMessage,
  createRelayMessageParams,
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

const tokenAddresses: string[] = [
  USDT_ADDRESS,
  USDC_ADDRESS,
  WBTC_ADDRESS,
  WETH_ADDRESS,
];

const decimals: bigint[] = [6n, 6n, 8n];

for (const [index, value] of tokenAddresses.entries()) {
  describe(`Bridging ${value} token`, function () {
    // Timeout 6 minutes
    const DEFAULT_TIMEOUT_MS: number = 400_000;
    const FUEL_MESSAGE_TIMEOUT_MS: number = 30_000;
    const DECIMAL_DIFF = 1_000_000_000n;
    const WETH_DEPOSIT = parseEther('20');

    let customToken: CustomToken;
    let fuelAssetId: string;

    let env: TestEnvironment;
    let weth_testToken: CustomTokenWETH;

    let eth_erc20GatewayAddress: string;
    let fuel_bridge: BridgeFungibleToken;
    let fuel_bridgeImpl: BridgeFungibleToken;
    let fuel_bridgeContractId: string;

    // override the default test timeout from 2000ms
    this.timeout(DEFAULT_TIMEOUT_MS);

    async function generateWithdrawalMessageProof(
      fuel_bridge: BridgeFungibleToken,
      fuelTokenSender: FuelWallet,
      ethereumTokenReceiverAddress: string,
      NUM_TOKENS: bigint,
      DECIMAL_DIFF: bigint,
      fuel_AssetId: string,
      decimals: bigint
    ): Promise<MessageProof> {
      // withdraw tokens back to the base chain
      fuel_bridge.account = fuelTokenSender;
      const paddedAddress =
        '0x' + ethereumTokenReceiverAddress.slice(2).padStart(64, '0');
      const fuelTokenSenderBalance = await fuelTokenSender.getBalance(
        fuel_AssetId
      );

      let transactionRequest;
      if (decimals < 18) {
        transactionRequest = await fuel_bridge.functions
          .withdraw(paddedAddress)
          .addContracts([fuel_bridge, fuel_bridgeImpl])
          .txParams({
            tip: 0,
            gasLimit: 1_000_000,
            maxFee: 1,
          })
          .callParams({
            forward: {
              amount: new BN(NUM_TOKENS.toString())
                .div(new BN(DECIMAL_DIFF.toString()))
                .div(
                  new BN(DECIMAL_DIFF.toString()).div(
                    new BN((10n ** decimals).toString())
                  )
                ),
              assetId: fuel_AssetId,
            },
          })
          .fundWithRequiredCoins();
      } else {
        transactionRequest = await fuel_bridge.functions
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
              assetId: fuel_AssetId,
            },
          })
          .fundWithRequiredCoins();
      }

      const tx = await fuelTokenSender.sendTransaction(transactionRequest);
      const fWithdrawTxResult = await tx.waitForResult();
      expect(fWithdrawTxResult.status).to.equal('success');

      // check that the sender balance has decreased by the expected amount
      const newSenderBalance = await fuelTokenSender.getBalance(fuel_AssetId);

      if (decimals < 18) {
        expect(
          newSenderBalance.eq(
            fuelTokenSenderBalance.sub(
              toBeHex(
                NUM_TOKENS / DECIMAL_DIFF / (DECIMAL_DIFF / 10n ** decimals)
              )
            )
          )
        ).to.be.true;
      } else {
        expect(
          newSenderBalance.eq(
            fuelTokenSenderBalance.sub(toBeHex(NUM_TOKENS / DECIMAL_DIFF))
          )
        ).to.be.true;
      }

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

      let token;

      if (index == tokenAddresses.length - 1) {
        weth_testToken = CustomTokenWETH__factory.connect(
          value,
          env.eth.deployer
        );
      } else {
        token = CustomToken__factory.connect(value, env.eth.deployer);
      }

      if (index < tokenAddresses.length - 1) {
        customToken = token;
      }

      const { contract, implementation } = await getOrDeployL2Bridge(
        env,
        env.eth.fuelERC20Gateway
      );

      fuel_bridge = contract;
      fuel_bridgeImpl = implementation;

      fuel_bridgeContractId = fuel_bridge.id.toHexString();

      await env.eth.fuelERC20Gateway.setAssetIssuerId(fuel_bridgeContractId);

      fuelAssetId = getTokenId(fuel_bridge, value);

      // initializing rate limit params for the token
      if (index == tokenAddresses.length - 1) {
        await env.eth.fuelERC20Gateway
          .connect(env.eth.deployer)
          .resetRateLimitAmount(
            value,
            RATE_LIMIT_AMOUNT.toString(),
            RATE_LIMIT_DURATION
          );
      } else {
        const rateLimitAmount =
          BigInt(RATE_LIMIT_AMOUNT) / 10n ** (18n - decimals[index]);
        await env.eth.fuelERC20Gateway
          .connect(env.eth.deployer)
          .resetRateLimitAmount(
            await customToken.getAddress(),
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

    describe('Bridge ERC20 to Fuel', () => {
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

        if (index == tokenAddresses.length - 1) {
          await weth_testToken
            .connect(ethereumTokenSender)
            .deposit({ value: WETH_DEPOSIT });

          ethereumTokenSenderBalance = await weth_testToken.balanceOf(
            ethereumTokenSenderAddress
          );
        } else {
          const mintAmount =
            BigInt(NUM_TOKENS) / 10n ** (18n - decimals[index]);
          await customToken
            .mint(ethereumTokenSender, mintAmount)
            .then((tx) => tx.wait());

          ethereumTokenSenderBalance = await customToken.balanceOf(
            ethereumTokenSenderAddress
          );
        }

        fuelTokenReceiver = env.fuel.signers[0];
        fuelTokenReceiverAddress = fuelTokenReceiver.address.toHexString();
        fuelTokenReceiverBalance = await fuelTokenReceiver.getBalance(
          fuelAssetId
        );
      });

      it('Bridge ERC20 via FuelERC20Gateway', async () => {
        // approve FuelERC20Gateway to spend the tokens

        if (index == tokenAddresses.length - 1) {
          await weth_testToken
            .connect(ethereumTokenSender)
            .approve(eth_erc20GatewayAddress, NUM_TOKENS)
            .then((tx) => tx.wait());
        } else {
          const approveAmount =
            BigInt(NUM_TOKENS) / 10n ** (18n - decimals[index]);

          await customToken
            .connect(ethereumTokenSender)
            .approve(eth_erc20GatewayAddress, approveAmount)
            .then((tx) => tx.wait());
        }

        // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
        let receipt;
        if (index == tokenAddresses.length - 1) {
          receipt = await env.eth.fuelERC20Gateway
            .connect(ethereumTokenSender)
            .deposit(
              fuelTokenReceiverAddress,
              await weth_testToken.getAddress(),
              WETH_DEPOSIT
            )
            .then((tx) => tx.wait());
        } else {
          const depositAmount =
            BigInt(NUM_TOKENS) / 10n ** (18n - decimals[index]);

          receipt = await env.eth.fuelERC20Gateway
            .connect(ethereumTokenSender)
            .deposit(
              fuelTokenReceiverAddress,
              await customToken.getAddress(),
              depositAmount
            )
            .then((tx) => tx.wait());
        }

        expect(receipt.status).to.equal(1);

        // parse events from logs
        const [event, ...restOfEvents] =
          await env.eth.fuelMessagePortal.queryFilter(
            env.eth.fuelMessagePortal.filters.MessageSent,
            receipt.blockNumber,
            receipt.blockNumber
          );
        expect(restOfEvents.length).to.be.eq(0); // Should be only 1 event

        fuelTokenMessageReceiver = Address.fromB256(event.args.recipient);

        fuelTokenMessageNonce = new BN(event.args.nonce.toString());

        let newSenderBalance;

        // check that the sender balance has decreased by the expected amount
        if (index == tokenAddresses.length - 1) {
          newSenderBalance = await weth_testToken.balanceOf(
            ethereumTokenSenderAddress
          );

          expect(newSenderBalance === 0n).to.be.true;
        } else {
          newSenderBalance = await customToken.balanceOf(
            ethereumTokenSenderAddress
          );
          expect(
            newSenderBalance ===
              ethereumTokenSenderBalance -
                BigInt(NUM_TOKENS) / 10n ** (18n - decimals[index])
          ).to.be.true;
        }
      });

      it('Relay message from Ethereum on Fuel', async () => {
        // override the default test timeout from 2000ms
        this.timeout(FUEL_MESSAGE_TIMEOUT_MS);

        // relay the message ourselves
        let message = await waitForMessage(
          env.fuel.provider,
          fuelTokenMessageReceiver,
          fuelTokenMessageNonce,
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

        expect(mintedAsset.assetId).to.equal(fuelAssetId);
        if (index == tokenAddresses.length - 1) {
          expect(mintedAsset.amount.toString()).to.equal(
            (WETH_DEPOSIT / DECIMAL_DIFF).toString()
          );
        } else {
          expect(mintedAsset.amount.toString()).to.equal(
            (
              NUM_TOKENS /
              DECIMAL_DIFF /
              (DECIMAL_DIFF / 10n ** decimals[index])
            ).toString()
          );
        }
      });

      it('Check metadata was registered', async () => {
        await fuel_bridge.functions
          .asset_to_l1_address({ bits: fuelAssetId })
          .addContracts([fuel_bridge, fuel_bridgeImpl])
          .dryRun();
        const { value: l2_decimals } = await fuel_bridge.functions
          .decimals({ bits: fuelAssetId })
          .addContracts([fuel_bridge, fuel_bridgeImpl])
          .get();

        if (index == tokenAddresses.length - 1) {
          expect(l2_decimals).to.be.equal(9);
        } else {
          expect(l2_decimals.toString()).to.be.equal(
            decimals[index].toString()
          );
        }
      });

      it('Check ERC20 arrived on Fuel', async () => {
        // check that the recipient balance has increased by the expected amount
        const newReceiverBalance = await fuelTokenReceiver.getBalance(
          fuelAssetId
        );
        if (index == tokenAddresses.length - 1) {
          expect(
            newReceiverBalance.eq(
              fuelTokenReceiverBalance.add(toBeHex(WETH_DEPOSIT / DECIMAL_DIFF))
            )
          ).to.be.true;
        } else {
          expect(
            newReceiverBalance.eq(
              fuelTokenReceiverBalance.add(
                toBeHex(
                  NUM_TOKENS /
                    DECIMAL_DIFF /
                    (DECIMAL_DIFF / 10n ** decimals[index])
                )
              )
            )
          ).to.be.true;
        }
      });

      it('Bridge metadata', async () => {
        // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
        const receipt = await env.eth.fuelERC20Gateway
          .connect(ethereumTokenSender)
          .sendMetadata(value)
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

    describe('Bridge ERC20 from Fuel', function () {
      const NUM_TOKENS = 10000000000000000000n;
      let fuelTokenSender: FuelWallet;
      let ethereumTokenReceiver: Signer;
      let ethereumTokenReceiverAddress: string;
      let ethereumTokenReceiverBalance: bigint;
      let withdrawMessageProof: MessageProof;

      before(async () => {
        fuelTokenSender = env.fuel.signers[0];
        ethereumTokenReceiver = env.eth.signers[0];
        ethereumTokenReceiverAddress = await ethereumTokenReceiver.getAddress();

        if (index == tokenAddresses.length - 1) {
          ethereumTokenReceiverBalance = await weth_testToken.balanceOf(
            ethereumTokenReceiverAddress
          );
        } else {
          ethereumTokenReceiverBalance = await customToken.balanceOf(
            ethereumTokenReceiverAddress
          );
        }
      });

      it('Bridge ERC20 via Fuel token contract', async () => {
        // withdraw tokens back to the base chain
        withdrawMessageProof = await generateWithdrawalMessageProof(
          fuel_bridge,
          fuelTokenSender,
          ethereumTokenReceiverAddress,
          NUM_TOKENS,
          DECIMAL_DIFF,
          fuelAssetId,
          index == tokenAddresses.length - 1 ? 18n : decimals[index]
        );
      });

      it('Relay Message from Fuel on Ethereum', async () => {
        const withdrawnAmountBeforeRelay =
          await env.eth.fuelERC20Gateway.currentPeriodAmount(value);

        const rateLimitEndDuratioBeforeRelay =
          await env.eth.fuelERC20Gateway.currentPeriodEnd(value);

        // relay message
        await relayMessage(env, withdrawMessageProof);

        // check rate limit params
        const withdrawnAmountAfterRelay =
          await env.eth.fuelERC20Gateway.currentPeriodAmount(value);

        const rateLimitEndDuratioAfterRelay =
          await env.eth.fuelERC20Gateway.currentPeriodEnd(value);

        expect(rateLimitEndDuratioAfterRelay === rateLimitEndDuratioBeforeRelay)
          .to.be.true;

        if (index < tokenAddresses.length - 1) {
          expect(
            withdrawnAmountAfterRelay ===
              BigInt(NUM_TOKENS) / 10n ** (18n - decimals[index]) +
                withdrawnAmountBeforeRelay
          ).to.be.true;
        } else {
          expect(
            withdrawnAmountAfterRelay ===
              WETH_DEPOSIT / 2n + withdrawnAmountBeforeRelay
          ).to.be.true;
        }
      });

      it('Rate limit parameters are updated when current withdrawn amount is more than the new limit', async () => {
        const deployer = await env.eth.deployer;
        const newRateLimit = '5';

        if (index < tokenAddresses.length - 1) {
          await env.eth.fuelERC20Gateway
            .connect(deployer)
            .resetRateLimitAmount(
              value,
              parseEther(newRateLimit) / 10n ** (18n - decimals[index]),
              RATE_LIMIT_DURATION
            );
        } else {
          await env.eth.fuelERC20Gateway
            .connect(deployer)
            .resetRateLimitAmount(
              value,
              parseEther(newRateLimit),
              RATE_LIMIT_DURATION
            );
        }

        const currentWithdrawnAmountAfterSettingLimit =
          await env.eth.fuelERC20Gateway.currentPeriodAmount(value);
        if (index < tokenAddresses.length - 1) {
          expect(
            currentWithdrawnAmountAfterSettingLimit ===
              parseEther(newRateLimit) / 10n ** (18n - decimals[index])
          ).to.be.true;
        } else {
          expect(
            currentWithdrawnAmountAfterSettingLimit === parseEther(newRateLimit)
          ).to.be.true;
        }
      });

      it('Rate limit parameters are updated when the initial duration is over', async () => {
        const deployer = await env.eth.deployer;
        const newRateLimit = `30`;

        const rateLimitDuration =
          await env.eth.fuelERC20Gateway.rateLimitDuration(value);

        // fast forward time
        await hardhatSkipTime(
          env.eth.provider as JsonRpcProvider,
          rateLimitDuration * 2n
        );
        const currentPeriodEndBeforeRelay =
          await env.eth.fuelERC20Gateway.currentPeriodEnd(value);

        if (index < tokenAddresses.length - 1) {
          await env.eth.fuelERC20Gateway
            .connect(deployer)
            .resetRateLimitAmount(
              value,
              parseEther(newRateLimit) / 10n ** (18n - decimals[index]),
              RATE_LIMIT_DURATION
            );
        } else {
          await env.eth.fuelERC20Gateway
            .connect(deployer)
            .resetRateLimitAmount(
              value,
              parseEther(newRateLimit),
              RATE_LIMIT_DURATION
            );
        }

        // withdraw tokens back to the base chain
        withdrawMessageProof = await generateWithdrawalMessageProof(
          fuel_bridge,
          fuelTokenSender,
          ethereumTokenReceiverAddress,
          NUM_TOKENS,
          DECIMAL_DIFF,
          fuelAssetId,
          index == fuelAssetId.length - 1 ? 18n : decimals[index]
        );

        // relay message
        await relayMessage(env, withdrawMessageProof);

        const currentPeriodEndAfterRelay =
          await env.eth.fuelERC20Gateway.currentPeriodEnd(value);

        expect(currentPeriodEndAfterRelay > currentPeriodEndBeforeRelay).to.be
          .true;

        const currentPeriodAmount =
          await env.eth.fuelERC20Gateway.currentPeriodAmount(value);

        if (index < tokenAddresses.length - 1) {
          expect(
            currentPeriodAmount ===
              BigInt(NUM_TOKENS) / 10n ** (18n - decimals[index])
          ).to.be.true;
        } else {
          expect(currentPeriodAmount === WETH_DEPOSIT / 2n).to.be.true;
        }
      });

      it('Rate limit parameters are updated when new limit is set after the initial duration', async () => {
        const deployer = await env.eth.deployer;
        const newRateLimit = `40`;

        const rateLimitDuration =
          await env.eth.fuelERC20Gateway.rateLimitDuration(value);

        // fast forward time
        await hardhatSkipTime(
          env.eth.provider as JsonRpcProvider,
          rateLimitDuration * 2n
        );

        const currentWithdrawnAmountBeforeSettingLimit =
          await env.eth.fuelERC20Gateway.currentPeriodAmount(value);
        const currentPeriodEndBeforeSettingLimit =
          await env.eth.fuelERC20Gateway.currentPeriodEnd(value);

        if (index < tokenAddresses.length - 1) {
          await env.eth.fuelERC20Gateway
            .connect(deployer)
            .resetRateLimitAmount(
              value,
              parseEther(newRateLimit) / 10n ** (18n - decimals[index]),
              RATE_LIMIT_DURATION
            );
        } else {
          await env.eth.fuelERC20Gateway
            .connect(deployer)
            .resetRateLimitAmount(
              value,
              parseEther(newRateLimit),
              RATE_LIMIT_DURATION
            );
        }

        const currentPeriodEndAfterSettingLimit =
          await env.eth.fuelERC20Gateway.currentPeriodEnd(value);
        const currentWithdrawnAmountAfterSettingLimit =
          await env.eth.fuelERC20Gateway.currentPeriodAmount(value);

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
        let newReceiverBalance;

        if (index < tokenAddresses.length - 1) {
          newReceiverBalance = await customToken.balanceOf(
            ethereumTokenReceiverAddress
          );
          expect(
            newReceiverBalance ===
              ethereumTokenReceiverBalance +
                (BigInt(NUM_TOKENS) / 10n ** (18n - decimals[index])) * 2n
          ).to.be.true;
        } else {
          // checking for weth
          newReceiverBalance = await weth_testToken.balanceOf(
            ethereumTokenReceiverAddress
          );
          expect(
            newReceiverBalance ===
              ethereumTokenReceiverBalance + NUM_TOKENS * 2n
          ).to.be.true;
        }
      });
    });
  });
}
