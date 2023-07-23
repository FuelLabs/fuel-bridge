import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { BigNumber, Signer } from 'ethers';
import { TestEnvironment, setupEnvironment } from '../scripts/setup';
import { Token } from '@fuel-bridge/portal-contracts';
import {
  AbstractAddress,
  Address,
  BN,
  Contract,
  WalletUnlocked as FuelWallet,
  MessageProof,
} from 'fuels';
import { relayCommonMessage } from '../scripts/utils/fuels/relayCommonMessage';
import { waitForMessage } from '../scripts/utils/fuels/waitForMessage';
import { createRelayMessageParams } from '../scripts/utils/ethers/createRelayParams';
import { waitNextBlock } from '../scripts/utils/fuels/waitNextBlock';
import { getOrDeployECR20Contract } from '../scripts/utils/ethers/getOrDeployECR20Contract';
import { getOrDeployFuelTokenContract } from '../scripts/utils/fuels/getOrDeployFuelTokenContract';
import { FUEL_TX_PARAMS } from '../scripts/utils/constants';
import { getMessageOutReceipt } from '../scripts/utils/fuels/getMessageOutReceipt';
import { fuel_to_eth_address } from '../scripts/utils/parsers';
import { LOG_CONFIG } from '../scripts/utils/logs';
import { waitForBlockCommit } from '../scripts/utils/ethers/waitForBlockCommit';
import { waitForBlockFinalization } from '../scripts/utils/ethers/waitForBlockFinalization';

LOG_CONFIG.debug = false;

chai.use(solidity);
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
  let fuel_testTokenId: string;

  // override the default test timeout from 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  before(async () => {
    env = await setupEnvironment({});
    eth_testToken = await getOrDeployECR20Contract(env);
    eth_testTokenAddress = eth_testToken.address.toLowerCase();
    fuel_testToken = await getOrDeployFuelTokenContract(
      env,
      eth_testToken,
      FUEL_TX_PARAMS
    );
    fuel_testTokenId = fuel_testToken.id.toHexString();
  });

  it('Setup tokens to bridge', async () => {
    const { value: expectedTokenContractId } = await fuel_testToken.functions
      .bridged_token()
      .get();
    const { value: expectedGatewayContractId } = await fuel_testToken.functions
      .bridged_token_gateway()
      .get();

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
    await expect(
      eth_testToken.mint(await env.eth.deployer.getAddress(), 10_000)
    ).to.not.be.reverted;
    await expect(
      eth_testToken.mint(await env.eth.signers[0].getAddress(), 10_000)
    ).to.not.be.reverted;
    await expect(
      eth_testToken.mint(await env.eth.signers[1].getAddress(), 10_000)
    ).to.not.be.reverted;
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
        fuel_testTokenId
      );
    });

    it('Bridge ERC20 via FuelERC20Gateway', async () => {
      // approve FuelERC20Gateway to spend the tokens
      await expect(
        eth_testToken
          .connect(ethereumTokenSender)
          .approve(env.eth.fuelERC20Gateway.address, NUM_TOKENS)
      ).to.not.be.reverted;

      // use the FuelERC20Gateway to deposit test tokens and receive equivalent tokens on Fuel
      let tx = await env.eth.fuelERC20Gateway
        .connect(ethereumTokenSender)
        .deposit(
          fuelTokenReceiverAddress,
          eth_testToken.address,
          fuel_testTokenId,
          NUM_TOKENS
        );
      let result = await tx.wait();
      expect(result.status).to.equal(1);

      // parse events from logs
      let event = env.eth.fuelMessagePortal.interface.parseLog(result.logs[2]);
      fuelTokenMessageNonce = new BN(event.args.nonce.toHexString());
      fuelTokenMessageReceiver = Address.fromB256(event.args.recipient);

      // check that the sender balance has decreased by the expected amount
      let newSenderBalance = await eth_testToken.balanceOf(
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
      const tx = await relayCommonMessage(env.fuel.deployer, message);
      expect((await tx.waitForResult()).status.type).to.equal('success');
    });

    it('Check ERC20 arrived on Fuel', async () => {
      // check that the recipient balance has increased by the expected amount
      let newReceiverBalance = await fuelTokenReceiver.getBalance(
        fuel_testTokenId
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
    let fuelTokenSenderBalance: BN;
    let ethereumTokenReceiver: Signer;
    let ethereumTokenReceiverAddress: string;
    let ethereumTokenReceiverBalance: BigNumber;
    let withdrawMessageProof: MessageProof;

    before(async () => {
      fuelTokenSender = env.fuel.signers[0];
      fuelTokenSenderBalance = await fuelTokenSender.getBalance(
        fuel_testTokenId
      );
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
      const scope = await fuel_testToken.functions
        .withdraw(paddedAddress)
        .callParams({
          forward: {
            amount: NUM_TOKENS / DECIMAL_DIFF,
            assetId: fuel_testTokenId,
          },
        })
        .fundWithRequiredCoins();
      const tx = await fuelTokenSender.sendTransaction(
        scope.transactionRequest
      );
      const fWithdrawTxResult = await tx.waitForResult();
      expect(fWithdrawTxResult.status.type).to.equal('success');

      // get message proof
      const nextBlockId = await waitNextBlock(env, fWithdrawTxResult.blockId);
      const messageOutReceipt = getMessageOutReceipt(
        fWithdrawTxResult.receipts
      );
      withdrawMessageProof = await fuelTokenSender.provider.getMessageProof(
        tx.id,
        messageOutReceipt.messageId,
        nextBlockId
      );

      // check that the sender balance has decreased by the expected amount
      let newSenderBalance = await fuelTokenSender.getBalance(fuel_testTokenId);
      expect(
        newSenderBalance.eq(
          fuelTokenSenderBalance.sub(NUM_TOKENS / DECIMAL_DIFF)
        )
      ).to.be.true;
    });

    it('Relay Message from Fuel on Ethereum', async () => {
      // construct relay message proof data
      const relayMessageParams = createRelayMessageParams(withdrawMessageProof);

      // commit block to L1
      await waitForBlockCommit(env, relayMessageParams.rootBlockHeader);
      // wait for block finalization
      await waitForBlockFinalization(env, relayMessageParams.rootBlockHeader);

      // relay message
      await expect(
        env.eth.fuelMessagePortal.relayMessage(
          relayMessageParams.message,
          relayMessageParams.rootBlockHeader,
          relayMessageParams.blockHeader,
          relayMessageParams.blockInHistoryProof,
          relayMessageParams.messageInBlockProof
        )
      ).to.not.be.reverted;
    });

    it('Check ERC20 arrived on Ethereum', async () => {
      // check that the recipient balance has increased by the expected amount
      let newReceiverBalance = await eth_testToken.balanceOf(
        ethereumTokenReceiverAddress
      );
      expect(
        newReceiverBalance.eq(ethereumTokenReceiverBalance.add(NUM_TOKENS))
      ).to.be.true;
    });
  });
});
