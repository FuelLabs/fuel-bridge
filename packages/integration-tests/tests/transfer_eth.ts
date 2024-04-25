import { FuelBlockHeaderTester__factory } from '@fuel-bridge/solidity-contracts/typechain';
import type { TestEnvironment } from '@fuel-bridge/test-utils';
import {
  setupEnvironment,
  fuels_parseEther,
  createRelayMessageParams,
  getMessageOutReceipt,
  waitForMessage,
  waitForBlockCommit,
  waitForBlockFinalization,
  getBlock,
  FUEL_CALL_TX_PARAMS,
} from '@fuel-bridge/test-utils';
import chai from 'chai';
import type { Signer } from 'ethers';
import { parseEther } from 'ethers';
import { Address, BN, BaseAssetId, padFirst12BytesOfEvmAddress } from 'fuels';
import type {
  AbstractAddress,
  WalletUnlocked as FuelWallet,
  MessageProof,
} from 'fuels';

const { expect } = chai;

describe('Transferring ETH', async function () {
  // Timeout 6 minutes
  const DEFAULT_TIMEOUT_MS: number = 400_000;
  const FUEL_MESSAGE_TIMEOUT_MS: number = 30_000;

  let env: TestEnvironment;

  // override the default test timeout of 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  before(async () => {
    env = await setupEnvironment({});
  });

  describe('Send ETH to Fuel', async () => {
    const NUM_ETH = '0.1';
    let ethereumETHSender: Signer;
    let ethereumETHSenderAddress: string;
    let ethereumETHSenderBalance: bigint;
    let fuelETHReceiver: AbstractAddress;
    let fuelETHReceiverAddress: string;
    let fuelETHReceiverBalance: BN;
    let fuelETHMessageNonce: BN;
    before(async () => {
      ethereumETHSender = env.eth.signers[0];
      ethereumETHSenderAddress = await ethereumETHSender.getAddress();
      ethereumETHSenderBalance = await env.eth.provider.getBalance(
        ethereumETHSender
      );
      fuelETHReceiver = env.fuel.signers[0].address;
      fuelETHReceiverAddress = fuelETHReceiver.toHexString();
      fuelETHReceiverBalance = await env.fuel.provider.getBalance(
        fuelETHReceiver,
        BaseAssetId
      );
    });

    it('Send ETH via MessagePortal', async () => {
      // use the FuelMessagePortal to directly send ETH which should be immediately spendable
      const tx = await env.eth.fuelMessagePortal
        .connect(ethereumETHSender)
        .depositETH(fuelETHReceiverAddress, {
          value: parseEther(NUM_ETH),
        });
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      // parse events from logs
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

      fuelETHMessageNonce = new BN(event.args.nonce.toString());

      // check that the sender balance has decreased by the expected amount
      const newSenderBalance = await env.eth.provider.getBalance(
        ethereumETHSenderAddress
      );

      const txCost = receipt.gasUsed * receipt.gasPrice;
      const expectedSenderBalance =
        ethereumETHSenderBalance - txCost - parseEther(NUM_ETH);
      expect(newSenderBalance).to.be.eq(expectedSenderBalance);
    });

    it('Wait for ETH to arrive on Fuel', async function () {
      // wait for message to appear in fuel client
      expect(
        await waitForMessage(
          env.fuel.provider,
          fuelETHReceiver,
          fuelETHMessageNonce,
          FUEL_MESSAGE_TIMEOUT_MS
        )
      ).to.not.be.null;

      // check that the recipient balance has increased by the expected amount
      const newReceiverBalance = await env.fuel.provider.getBalance(
        fuelETHReceiver,
        BaseAssetId
      );
      expect(
        newReceiverBalance.eq(
          fuelETHReceiverBalance.add(fuels_parseEther(NUM_ETH))
        )
      ).to.be.true;
    });
  });

  describe('Send ETH from Fuel', async () => {
    const NUM_ETH = '0.1';
    let fuelETHSender: FuelWallet;
    let fuelETHSenderBalance: BN;
    let ethereumETHReceiver: Signer;
    let ethereumETHReceiverAddress: string;
    let ethereumETHReceiverBalance: bigint;
    let withdrawMessageProof: MessageProof;

    before(async () => {
      fuelETHSender = env.fuel.signers[1];
      fuelETHSenderBalance = await fuelETHSender.getBalance(BaseAssetId);
      ethereumETHReceiver = env.eth.signers[1];
      ethereumETHReceiverAddress = await ethereumETHReceiver.getAddress();
      ethereumETHReceiverBalance = await env.eth.provider.getBalance(
        ethereumETHReceiver
      );
    });

    it('Send ETH via OutputMessage', async () => {
      // withdraw ETH back to the base chain
      const fWithdrawTx = await fuelETHSender.withdrawToBaseLayer(
        Address.fromString(
          padFirst12BytesOfEvmAddress(ethereumETHReceiverAddress)
        ),
        fuels_parseEther(NUM_ETH),
        FUEL_CALL_TX_PARAMS
      );
      const fWithdrawTxResult = await fWithdrawTx.waitForResult();
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

      // get message proof
      const messageOutReceipt = getMessageOutReceipt(
        fWithdrawTxResult.receipts
      );
      withdrawMessageProof = await fuelETHSender.provider.getMessageProof(
        fWithdrawTx.id,
        messageOutReceipt.nonce,
        commitHashAtL1
      );

      // check that the sender balance has decreased by the expected amount
      const newSenderBalance = await fuelETHSender.getBalance(BaseAssetId);

      // Get just the first 3 digits of the balance to compare to the expected balance
      // this is required because the payment of gas fees is not deterministic
      const diffOnSenderBalance = newSenderBalance
        .sub(fuelETHSenderBalance)
        .formatUnits();
      expect(diffOnSenderBalance.startsWith(NUM_ETH)).to.be.true;
    });

    it('Relay Message from Fuel on Ethereum', async () => {
      // wait for block finalization

      await waitForBlockFinalization(env, withdrawMessageProof);

      console.log('Proof');
      console.log(withdrawMessageProof);
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

    it('Check ETH arrived on Ethereum', async () => {
      // check that the recipient balance has increased by the expected amount
      const newReceiverBalance = await env.eth.provider.getBalance(
        ethereumETHReceiver
      );
      expect(
        newReceiverBalance === ethereumETHReceiverBalance + parseEther(NUM_ETH)
      ).to.be.true;
    });
  });
});
