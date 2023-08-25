import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { BigNumber, Signer } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import {
  AbstractAddress,
  Address,
  BN,
  WalletUnlocked as FuelWallet,
  BaseAssetId,
  MessageProof,
} from 'fuels';
import { TestEnvironment, setupEnvironment } from '../scripts/setup';
import { fuels_parseEther } from '../scripts/utils/parsers';
import { createRelayMessageParams } from '../scripts/utils/ethers/createRelayParams';
import { getMessageOutReceipt } from '../scripts/utils/fuels/getMessageOutReceipt';
import { waitForMessage } from '../scripts/utils/fuels/waitForMessage';
import { FUEL_TX_PARAMS } from '../scripts/utils/constants';
import { waitForBlockCommit } from '../scripts/utils/ethers/waitForBlockCommit';
import { waitForBlockFinalization } from '../scripts/utils/ethers/waitForBlockFinalization';
import { getBlock } from '../scripts/utils/fuels/getBlock';

chai.use(solidity);
const { expect } = chai;

describe('Transferring ETH', async function () {
  // Timeout 6 minutes
  const DEFAULT_TIMEOUT_MS: number = 400_000;
  const FUEL_MESSAGE_TIMEOUT_MS: number = 30_000;

  let env: TestEnvironment;

  // override the default test timeout from 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  before(async () => {
    env = await setupEnvironment({});
  });

  describe('Send ETH to Fuel', async () => {
    const NUM_ETH = '0.1';
    let ethereumETHSender: Signer;
    let ethereumETHSenderAddress: string;
    let ethereumETHSenderBalance: BigNumber;
    let fuelETHReceiver: AbstractAddress;
    let fuelETHReceiverAddress: string;
    let fuelETHReceiverBalance: BN;
    let fuelETHMessageNonce: BN;
    before(async () => {
      ethereumETHSender = env.eth.signers[0];
      ethereumETHSenderAddress = await ethereumETHSender.getAddress();
      ethereumETHSenderBalance = await ethereumETHSender.getBalance();
      fuelETHReceiver = env.fuel.signers[0].address;
      fuelETHReceiverAddress = fuelETHReceiver.toHexString();
      fuelETHReceiverBalance = await env.fuel.provider.getBalance(
        fuelETHReceiver,
        BaseAssetId
      );
    });

    it('Send ETH via MessagePortal', async () => {
      // use the FuelMessagePortal to directly send ETH which should be immediately spendable
      let tx = await env.eth.fuelMessagePortal
        .connect(ethereumETHSender)
        .depositETH(fuelETHReceiverAddress, {
          value: parseEther(NUM_ETH),
        });
      let result = await tx.wait();
      expect(result.status).to.equal(1);

      // parse events from logs
      let event = env.eth.fuelMessagePortal.interface.parseLog(result.logs[0]);
      fuelETHMessageNonce = new BN(event.args.nonce.toHexString());

      // check that the sender balance has decreased by the expected amount
      let newSenderBalance = await env.eth.provider.getBalance(
        ethereumETHSenderAddress
      );
      let ethereumETHSenderBalanceMinusGas = ethereumETHSenderBalance.sub(
        result.gasUsed.mul(result.effectiveGasPrice)
      );
      expect(
        newSenderBalance.eq(
          ethereumETHSenderBalanceMinusGas.sub(parseEther(NUM_ETH))
        )
      ).to.be.true;
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
      let newReceiverBalance = await env.fuel.provider.getBalance(
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
    let fuelETHSenderAddress: string;
    let fuelETHSenderBalance: BN;
    let ethereumETHReceiver: Signer;
    let ethereumETHReceiverAddress: string;
    let ethereumETHReceiverBalance: BigNumber;
    let withdrawMessageProof: MessageProof;

    before(async () => {
      fuelETHSender = env.fuel.signers[1];
      fuelETHSenderAddress = fuelETHSender.address.toHexString();
      fuelETHSenderBalance = await fuelETHSender.getBalance(BaseAssetId);
      ethereumETHReceiver = env.eth.signers[1];
      ethereumETHReceiverAddress = await ethereumETHReceiver.getAddress();
      ethereumETHReceiverBalance = await ethereumETHReceiver.getBalance();
    });

    it('Send ETH via OutputMessage', async () => {
      // withdraw ETH back to the base chain
      const fWithdrawTx = await fuelETHSender.withdrawToBaseLayer(
        Address.fromString(ethereumETHReceiverAddress),
        fuels_parseEther(NUM_ETH),
        FUEL_TX_PARAMS
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
        messageOutReceipt.messageId,
        commitHashAtL1
      );

      // check that the sender balance has decreased by the expected amount
      let newSenderBalance = await fuelETHSender.getBalance(BaseAssetId);

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

      // construct relay message proof data
      const relayMessageParams = createRelayMessageParams(withdrawMessageProof);

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

    it('Check ETH arrived on Ethereum', async () => {
      // check that the recipient balance has increased by the expected amount
      let newReceiverBalance = await ethereumETHReceiver.getBalance();
      expect(
        newReceiverBalance.eq(
          ethereumETHReceiverBalance.add(parseEther(NUM_ETH))
        )
      ).to.be.true;
    });
  });
});
