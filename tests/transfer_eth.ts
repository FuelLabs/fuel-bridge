import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { BigNumber, Signer } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import {
  AbstractAddress,
  Address,
  BN,
  MessageProof,
  TransactionResultMessageOutReceipt,
  WalletUnlocked as FuelWallet,
} from 'fuels';
import { TestEnvironment, setupEnvironment } from '../scripts/setup';
import { fuels_parseEther, fuels_waitForMessage } from '../scripts/utils';

chai.use(solidity);
const { expect } = chai;

// The BlockHeader structure.
class BlockHeader {
  constructor(
    // Consensus
    public prevRoot: string,
    public height: string,
    public timestamp: string,

    // Application
    public daHeight: string,
    public txCount: string,
    public outputMessagesCount: string,
    public txRoot: string,
    public outputMessagesRoot: string
  ) {}
}

// The MessageOutput structure.
class MessageOutput {
  constructor(
    public sender: string,
    public recipient: string,
    public amount: string,
    public nonce: string,
    public data: string
  ) {}
}

describe('Transferring ETH', async function () {
  const ETH_ASSET_ID = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const DEFAULT_TIMEOUT_MS: number = 20_000;
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
      fuelETHReceiverBalance = await env.fuel.provider.getBalance(fuelETHReceiver, ETH_ASSET_ID);
    });

    it('Send ETH via MessagePortal', async () => {
      // use the FuelMessagePortal to directly send ETH which should be immediately spendable
      let tx = await env.eth.fuelMessagePortal
        .connect(ethereumETHSender)
        .sendETH(fuelETHReceiverAddress, {
          value: parseEther(NUM_ETH),
        });
      let result = await tx.wait();
      expect(result.status).to.equal(1);

      // parse events from logs
      let event = env.eth.fuelMessagePortal.interface.parseLog(result.logs[0]);
      fuelETHMessageNonce = new BN(event.args.nonce.toHexString());

      // check that the sender balance has decreased by the expected amount
      let newSenderBalance = await env.eth.provider.getBalance(ethereumETHSenderAddress);
      let ethereumETHSenderBalanceMinusGas = ethereumETHSenderBalance.sub(
        result.gasUsed.mul(result.effectiveGasPrice)
      );
      expect(newSenderBalance.eq(ethereumETHSenderBalanceMinusGas.sub(parseEther(NUM_ETH)))).to.be
        .true;
    });

    it('Wait for ETH to arrive on Fuel', async function () {
      // override the default test timeout from 2000ms
      this.timeout(FUEL_MESSAGE_TIMEOUT_MS);

      // wait for message to appear in fuel client
      expect(
        await fuels_waitForMessage(
          env.fuel.provider,
          fuelETHReceiver,
          fuelETHMessageNonce,
          FUEL_MESSAGE_TIMEOUT_MS
        )
      ).to.not.be.null;

      // check that the recipient balance has increased by the expected amount
      let newReceiverBalance = await env.fuel.provider.getBalance(fuelETHReceiver, ETH_ASSET_ID);
      expect(newReceiverBalance.eq(fuelETHReceiverBalance.add(fuels_parseEther(NUM_ETH)))).to.be
        .true;
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
      fuelETHSenderBalance = await fuelETHSender.getBalance(ETH_ASSET_ID);
      ethereumETHReceiver = env.eth.signers[1];
      ethereumETHReceiverAddress = await ethereumETHReceiver.getAddress();
      ethereumETHReceiverBalance = await ethereumETHReceiver.getBalance();
    });

    it('Send ETH via OutputMessage', async () => {
      // withdraw ETH back to the base chain
      const tx = await fuelETHSender.withdrawToBaseLayer(
        Address.fromString(ethereumETHReceiverAddress),
        fuels_parseEther(NUM_ETH)
      );
      const result = await tx.waitForResult();
      expect(result.status.type).to.equal('success');

      // get message proof
      const messageOutReceipt = <TransactionResultMessageOutReceipt>result.receipts[0];
      withdrawMessageProof = await env.fuel.provider.getMessageProof(
        tx.id,
        messageOutReceipt.messageID
      );

      // check that the sender balance has decreased by the expected amount
      let newSenderBalance = await fuelETHSender.getBalance(ETH_ASSET_ID);
      expect(newSenderBalance.eq(fuelETHSenderBalance.sub(fuels_parseEther(NUM_ETH)))).to.be.true;
    });

    it('Relay Message from Fuel on Ethereum', async () => {
      // construct relay message proof data
      const messageOutput: MessageOutput = {
        sender: withdrawMessageProof.sender.toHexString(),
        recipient: withdrawMessageProof.recipient.toHexString(),
        amount: withdrawMessageProof.amount.toHex(),
        nonce: withdrawMessageProof.nonce,
        data: withdrawMessageProof.data,
      };
      const blockHeader: BlockHeader = {
        prevRoot: withdrawMessageProof.header.prevRoot,
        height: withdrawMessageProof.header.height.toHex(),
        timestamp: new BN(withdrawMessageProof.header.time).toHex(),
        daHeight: withdrawMessageProof.header.daHeight.toHex(),
        txCount: withdrawMessageProof.header.transactionsCount.toHex(),
        outputMessagesCount: withdrawMessageProof.header.outputMessagesCount.toHex(),
        txRoot: withdrawMessageProof.header.transactionsRoot,
        outputMessagesRoot: withdrawMessageProof.header.outputMessagesRoot,
      };
      const messageInBlockProof = {
        key: withdrawMessageProof.proofIndex.toNumber(),
        proof: withdrawMessageProof.proofSet.slice(0, -1),
      };

      // relay message
      await expect(
        env.eth.fuelMessagePortal.relayMessageFromFuelBlock(
          messageOutput,
          blockHeader,
          messageInBlockProof,
          withdrawMessageProof.signature
        )
      ).to.not.be.reverted;
    });

    it('Check ETH arrived on Ethereum', async () => {
      // check that the recipient balance has increased by the expected amount
      let newReceiverBalance = await ethereumETHReceiver.getBalance();
      expect(newReceiverBalance.eq(ethereumETHReceiverBalance.add(parseEther(NUM_ETH)))).to.be.true;
    });
  });
});
