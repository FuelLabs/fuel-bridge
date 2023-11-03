import type { Provider } from '@ethersproject/abstract-provider';
import { calcRoot, constructTree, getProof } from '@fuel-ts/merkle';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { randomBytes } from 'crypto';
import { BigNumber, constants } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { deployments, ethers, upgrades } from 'hardhat';

import type BlockHeader from '../protocol/blockHeader';
import type { BlockHeaderLite } from '../protocol/blockHeader';
import {
  computeBlockId,
  generateBlockHeaderLite,
} from '../protocol/blockHeader';
import Message, { computeMessageId } from '../protocol/message';
import { randomBytes32, tai64Time } from '../protocol/utils';
import type {
  FuelMessagePortalV2,
  FuelChainState,
  MessageTester,
} from '../typechain';
import { FuelMessagePortalV2__factory } from '../typechain';

import { addressToB256, b256ToAddress } from './utils/addressConversion';
import { createBlock } from './utils/createBlock';
import type { TreeNode } from './utils/merkle';
import {
  BLOCKS_PER_COMMIT_INTERVAL,
  TIME_TO_FINALIZE,
  generateProof,
  getLeafIndexKey,
} from './utils/merkle';

describe.only('FuelMessagePortalV2 - Incoming messages', () => {
  const ETH_DECIMALS = 18;
  const FUEL_BASE_ASSET_DECIMALS = 9;
  const BASE_ASSET_CONVERSION = 10 ** (ETH_DECIMALS - FUEL_BASE_ASSET_DECIMALS);

  let provider: Provider;
  let addresses: string[];
  let signers: SignerWithAddress[];
  let fuelMessagePortal: FuelMessagePortalV2;
  let fuelChainState: FuelChainState;

  // Message data
  const messageTestData1 = randomBytes32();
  const messageTestData2 = randomBytes32();
  const messageTestData3 = randomBytes32();
  let messageNodes: TreeNode[];
  let trustedSenderAddress: string;

  // Testing contracts
  let messageTester: MessageTester;
  let messageTesterAddress: string;
  let b256_fuelMessagePortalAddress: string;

  // Messages
  let message1: Message;
  let message2: Message;
  let messageWithAmount: Message;
  let messageBadSender: Message;
  let messageBadRecipient: Message;
  let messageBadData: Message;
  let messageEOA: Message;
  let messageEOANoAmount: Message;

  // Arrays of committed block headers and their IDs
  let blockHeaders: BlockHeader[];
  let blockIds: string[];
  let endOfCommitIntervalHeader: BlockHeader;
  let endOfCommitIntervalHeaderLite: BlockHeaderLite;
  let unfinalizedBlock: BlockHeader;
  let prevBlockNodes: TreeNode[];

  async function setupMessages(
    portalAddr: string,
    messageTester: MessageTester,
    fuelChainState: FuelChainState,
    addresses: string[]
  ) {
    blockIds = [];
    blockHeaders = [];
    // get data for building messages
    messageTesterAddress = addressToB256(messageTester.address);
    b256_fuelMessagePortalAddress = addressToB256(portalAddr);

    trustedSenderAddress = await messageTester.getTrustedSender();

    // message from trusted sender
    message1 = new Message(
      trustedSenderAddress,
      messageTesterAddress,
      BigNumber.from(0),
      randomBytes32(),
      messageTester.interface.encodeFunctionData('receiveMessage', [
        messageTestData1,
        messageTestData2,
      ])
    );
    message2 = new Message(
      trustedSenderAddress,
      messageTesterAddress,
      BigNumber.from(0),
      randomBytes32(),
      messageTester.interface.encodeFunctionData('receiveMessage', [
        messageTestData2,
        messageTestData1,
      ])
    );
    // message from trusted sender with amount
    messageWithAmount = new Message(
      trustedSenderAddress,
      messageTesterAddress,
      ethers.utils.parseEther('0.1').div(BASE_ASSET_CONVERSION),
      randomBytes32(),
      messageTester.interface.encodeFunctionData('receiveMessage', [
        messageTestData2,
        messageTestData3,
      ])
    );
    // message from untrusted sender
    messageBadSender = new Message(
      randomBytes32(),
      messageTesterAddress,
      BigNumber.from(0),
      randomBytes32(),
      messageTester.interface.encodeFunctionData('receiveMessage', [
        messageTestData3,
        messageTestData1,
      ])
    );
    // message to bad recipient
    messageBadRecipient = new Message(
      trustedSenderAddress,
      addressToB256(portalAddr),
      BigNumber.from(0),
      randomBytes32(),
      messageTester.interface.encodeFunctionData('receiveMessage', [
        messageTestData2,
        messageTestData2,
      ])
    );
    // message with bad data
    messageBadData = new Message(
      trustedSenderAddress,
      messageTesterAddress,
      BigNumber.from(0),
      randomBytes32(),
      randomBytes32()
    );
    // message to EOA
    messageEOA = new Message(
      randomBytes32(),
      addressToB256(addresses[2]),
      ethers.utils.parseEther('0.1').div(BASE_ASSET_CONVERSION),
      randomBytes32(),
      '0x'
    );
    // message to EOA no amount
    messageEOANoAmount = new Message(
      randomBytes32(),
      addressToB256(addresses[3]),
      BigNumber.from(0),
      randomBytes32(),
      '0x'
    );

    // compile all message IDs
    const messageIds: string[] = [];
    messageIds.push(computeMessageId(message1));
    messageIds.push(computeMessageId(message2));
    messageIds.push(computeMessageId(messageWithAmount));
    messageIds.push(computeMessageId(messageBadSender));
    messageIds.push(computeMessageId(messageBadRecipient));
    messageIds.push(computeMessageId(messageBadData));
    messageIds.push(computeMessageId(messageEOA));
    messageIds.push(computeMessageId(messageEOANoAmount));
    messageNodes = constructTree(messageIds);

    // create blocks
    const messageCount = messageIds.length.toString();
    const messagesRoot = calcRoot(messageIds);
    for (let i = 0; i < BLOCKS_PER_COMMIT_INTERVAL - 1; i++) {
      const blockHeader = createBlock('', i, '', messageCount, messagesRoot);
      const blockId = computeBlockId(blockHeader);

      // append block header and Id to arrays
      blockHeaders.push(blockHeader);
      blockIds.push(blockId);
    }

    // create end of commit interval block
    const timestamp = tai64Time(new Date().getTime());
    endOfCommitIntervalHeader = createBlock(
      calcRoot(blockIds),
      blockIds.length,
      timestamp,
      messageCount,
      messagesRoot
    );
    endOfCommitIntervalHeaderLite = generateBlockHeaderLite(
      endOfCommitIntervalHeader
    );
    prevBlockNodes = constructTree(blockIds);
    blockIds.push(computeBlockId(endOfCommitIntervalHeader));

    // finalize blocks in the state contract
    await fuelChainState.commit(computeBlockId(endOfCommitIntervalHeader), 0);
    ethers.provider.send('evm_increaseTime', [TIME_TO_FINALIZE]);

    // create an unfinalized block
    unfinalizedBlock = createBlock(
      calcRoot(blockIds),
      BLOCKS_PER_COMMIT_INTERVAL * 11 - 1,
      timestamp,
      messageCount,
      messagesRoot
    );

    await fuelChainState.commit(computeBlockId(unfinalizedBlock), 10);
  }

  const fixture = deployments.createFixture(
    async ({ ethers, upgrades: { deployProxy } }) => {
      const provider = ethers.provider;
      const signers = await ethers.getSigners();
      const [deployer] = signers;

      const proxyOptions = {
        initializer: 'initialize',
      };

      const fuelChainState = await ethers
        .getContractFactory('FuelChainState', deployer)
        .then(
          (factory) =>
            deployProxy(factory, [], proxyOptions) as Promise<FuelChainState>
        );

      const fuelMessagePortal = await ethers
        .getContractFactory('FuelMessagePortal', deployer)
        .then((factory) =>
          deployProxy(factory, [fuelChainState.address], proxyOptions)
        )
        .then(({ address }) =>
          FuelMessagePortalV2__factory.connect(address, deployer)
        );

      const V2Implementation = await ethers.getContractFactory(
        'FuelMessagePortalV2'
      );

      const messageTester = await ethers
        .getContractFactory('MessageTester', deployer)
        .then(
          (factory) =>
            factory.deploy(fuelMessagePortal.address) as Promise<MessageTester>
        );

      return {
        provider,
        deployer,
        signers,
        fuelMessagePortal,
        fuelChainState,
        V2Implementation,
        messageTester,
        addresses: signers.map(({ address }) => address),
      };
    }
  );

  it('can upgrade from V1', async () => {
    const { fuelMessagePortal, V2Implementation } = await fixture();

    await expect(fuelMessagePortal.depositLimitGlobal()).to.be.reverted;

    await upgrades.upgradeProxy(fuelMessagePortal, V2Implementation, {
      call: { fn: 'initializeV2', args: [0, 0] },
    });

    expect(await fuelMessagePortal.depositLimitGlobal()).to.be.equal(0);
  });

  describe('Behaves like V2 - Accounting', () => {
    beforeEach('fixture', async () => {
      const fixt = await fixture();
      const { V2Implementation } = fixt;
      ({
        provider,
        fuelMessagePortal,
        fuelChainState,
        messageTester,
        addresses,
        signers,
      } = fixt);

      await upgrades.upgradeProxy(fuelMessagePortal, V2Implementation, {
        call: {
          fn: 'initializeV2',
          args: [constants.MaxUint256, constants.MaxUint256],
        },
      });

      await setupMessages(
        fuelMessagePortal.address,
        messageTester,
        fuelChainState,
        addresses
      );
    });

    // Simulates the case when withdrawn amount < initial deposited amount
    it('should reduce per account deposited balance', async () => {
      const recipient = b256ToAddress(messageEOA.recipient);
      const txSender = signers.find((signer) => signer.address === recipient);
      const withdrawnAmount = messageEOA.amount.mul(BASE_ASSET_CONVERSION);
      const depositedAmount = withdrawnAmount.mul(2);

      await fuelMessagePortal
        .connect(txSender)
        .depositETH(messageEOA.recipient, {
          value: depositedAmount,
        });
      expect(await fuelMessagePortal.depositedAmounts(recipient)).to.be.equal(
        depositedAmount
      );

      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageEOA,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );

      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);

      const relayTx = fuelMessagePortal.relayMessage(
        messageEOA,
        endOfCommitIntervalHeaderLite,
        msgBlockHeader,
        blockInRoot,
        msgInBlock
      );
      await expect(relayTx).to.not.be.reverted;
      await expect(relayTx).to.changeEtherBalances(
        [fuelMessagePortal.address, recipient],
        [withdrawnAmount.mul(-1), withdrawnAmount]
      );

      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
      const expectedDepositedAmount = depositedAmount.sub(withdrawnAmount);
      expect(await fuelMessagePortal.depositedAmounts(recipient)).to.be.equal(
        expectedDepositedAmount
      );
      expect(await fuelMessagePortal.totalDeposited()).to.be.equal(
        expectedDepositedAmount
      );
    });

    // Simulates the case when withdrawn amount > initial deposited amount
    it('should nullify per account deposited balance', async () => {
      const recipient = b256ToAddress(messageEOA.recipient);
      const txSender = signers.find((signer) => signer.address === recipient);
      const withdrawnAmount = messageEOA.amount.mul(BASE_ASSET_CONVERSION);
      const depositedAmount = withdrawnAmount.div(2);
      const otherDeposits = parseEther('10');

      await fuelMessagePortal.depositETH(randomBytes(32), {
        value: otherDeposits, // This fills the contract with ETH
      });
      await fuelMessagePortal
        .connect(txSender) // Deposit some eth for the recipient
        .depositETH(messageEOA.recipient, {
          value: depositedAmount,
        });
      expect(await fuelMessagePortal.depositedAmounts(recipient)).to.be.equal(
        depositedAmount
      );

      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageEOA,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );

      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);

      const relayTx = fuelMessagePortal.relayMessage(
        messageEOA,
        endOfCommitIntervalHeaderLite,
        msgBlockHeader,
        blockInRoot,
        msgInBlock
      );
      await expect(relayTx).to.not.be.reverted;
      await expect(relayTx).to.changeEtherBalances(
        [fuelMessagePortal.address, recipient],
        [withdrawnAmount.mul(-1), withdrawnAmount]
      );

      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
      expect(await fuelMessagePortal.depositedAmounts(recipient)).to.be.equal(
        0
      );

      const expectedTotalDeposited = otherDeposits
        .add(depositedAmount)
        .sub(withdrawnAmount);
      const actualTotalDeposited = await fuelMessagePortal.totalDeposited();
      expect(actualTotalDeposited).to.be.equal(expectedTotalDeposited);
    });
  });

  // This is essentially a copy - paste from `messagesIncoming.ts`
  describe('Behaves like V1 - Relay both valid and invalid messages', async () => {
    before(async () => {
      const fixt = await fixture();
      const { V2Implementation } = fixt;
      ({
        provider,
        fuelMessagePortal,
        fuelChainState,
        messageTester,
        addresses,
      } = fixt);

      await upgrades.upgradeProxy(fuelMessagePortal, V2Implementation, {
        call: {
          fn: 'initializeV2',
          args: [constants.MaxUint256, constants.MaxUint256],
        },
      });

      await setupMessages(
        fuelMessagePortal.address,
        messageTester,
        fuelChainState,
        addresses
      );
    });

    it('Should not get a valid message sender outside of relaying', async () => {
      await expect(
        fuelMessagePortal.messageSender()
      ).to.be.revertedWithCustomError(
        fuelMessagePortal,
        'CurrentMessageSenderNotSet'
      );
    });

    it('Should not be able to relay message with bad root block', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message1,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        fuelMessagePortal.relayMessage(
          message1,
          generateBlockHeaderLite(
            createBlock('', BLOCKS_PER_COMMIT_INTERVAL * 20 - 1)
          ),
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(fuelChainState, 'UnknownBlock');

      await expect(
        fuelMessagePortal.relayMessage(
          message1,
          generateBlockHeaderLite(unfinalizedBlock),
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(fuelMessagePortal, 'UnfinalizedBlock');
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should not be able to relay message with bad proof in root block', async () => {
      const portalBalance = await provider.getBalance(
        fuelMessagePortal.address
      );
      const messageTesterBalance = await provider.getBalance(
        messageTester.address
      );
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message1,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      blockInRoot.key = blockInRoot.key + 1;
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        fuelMessagePortal.relayMessage(
          message1,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(
        fuelMessagePortal,
        'InvalidBlockInHistoryProof'
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      expect(await provider.getBalance(fuelMessagePortal.address)).to.be.equal(
        portalBalance
      );
      expect(await provider.getBalance(messageTester.address)).to.be.equal(
        messageTesterBalance
      );
    });

    it('Should be able to relay valid message', async () => {
      const portalBalance = await provider.getBalance(
        fuelMessagePortal.address
      );
      const messageTesterBalance = await provider.getBalance(
        messageTester.address
      );
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message1,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        fuelMessagePortal.relayMessage(
          message1,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.not.be.reverted;
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
      expect(await messageTester.data1()).to.be.equal(messageTestData1);
      expect(await messageTester.data2()).to.be.equal(messageTestData2);
      expect(await provider.getBalance(fuelMessagePortal.address)).to.be.equal(
        portalBalance
      );
      expect(await provider.getBalance(messageTester.address)).to.be.equal(
        messageTesterBalance
      );
    });

    it('Should not be able to relay already relayed message', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message1,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
      await expect(
        fuelMessagePortal.relayMessage(
          message1,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(fuelMessagePortal, 'AlreadyRelayed');
    });

    it('Should not be able to relay message with low gas', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageWithAmount,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      const options = {
        gasLimit: 140000,
      };
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        fuelMessagePortal.relayMessage(
          messageWithAmount,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock,
          options
        )
      ).to.be.reverted;
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should be able to relay message with amount', async () => {
      const expectedWithdrawnAmount = messageWithAmount.amount.mul(
        BASE_ASSET_CONVERSION
      );

      await fuelMessagePortal.depositETH(messageWithAmount.sender, {
        value: expectedWithdrawnAmount,
      });

      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageWithAmount,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);

      const relayTx = fuelMessagePortal.relayMessage(
        messageWithAmount,
        endOfCommitIntervalHeaderLite,
        msgBlockHeader,
        blockInRoot,
        msgInBlock
      );

      await expect(relayTx).to.not.be.reverted;
      await expect(relayTx).to.changeEtherBalances(
        [fuelMessagePortal.address, messageTester.address],
        [expectedWithdrawnAmount.mul(-1), expectedWithdrawnAmount]
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);

      expect(await messageTester.data1()).to.be.equal(messageTestData2);
      expect(await messageTester.data2()).to.be.equal(messageTestData3);
    });

    it('Should not be able to relay message from untrusted sender', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageBadSender,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        fuelMessagePortal.relayMessage(
          messageBadSender,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(messageTester, 'InvalidMessageSender');
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should not be able to relay message to bad recipient', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageBadRecipient,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        fuelMessagePortal.relayMessage(
          messageBadRecipient,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWith('Message relay failed');
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should not be able to relay message with bad data', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageBadData,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        fuelMessagePortal.relayMessage(
          messageBadData,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWith('Message relay failed');
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should be able to relay message to EOA', async () => {
      const expectedWithdrawnAmount = messageEOA.amount.mul(
        BASE_ASSET_CONVERSION
      );
      const expectedRecipient = b256ToAddress(messageEOA.recipient);

      await fuelMessagePortal.depositETH(messageEOA.sender, {
        value: expectedWithdrawnAmount,
      });

      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageEOA,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );

      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);

      const relayTx = fuelMessagePortal.relayMessage(
        messageEOA,
        endOfCommitIntervalHeaderLite,
        msgBlockHeader,
        blockInRoot,
        msgInBlock
      );
      await expect(relayTx).to.not.be.reverted;
      await expect(relayTx).to.changeEtherBalances(
        [fuelMessagePortal.address, expectedRecipient],
        [expectedWithdrawnAmount.mul(-1), expectedWithdrawnAmount]
      );

      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
    });

    it('Should be able to relay message to EOA with no amount', async () => {
      const messageRecipient = b256ToAddress(messageEOANoAmount.recipient);

      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageEOANoAmount,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      const relayTx = fuelMessagePortal.relayMessage(
        messageEOANoAmount,
        endOfCommitIntervalHeaderLite,
        msgBlockHeader,
        blockInRoot,
        msgInBlock
      );
      await expect(relayTx).to.not.be.reverted;
      await expect(relayTx).to.changeEtherBalances(
        [fuelMessagePortal.address, messageRecipient],
        [0, 0]
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
    });

    it('Should not be able to relay valid message with different amount', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message2,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );

      const diffBlock = {
        sender: message2.sender,
        recipient: message2.recipient,
        nonce: message2.nonce,
        amount: message2.amount.add(ethers.utils.parseEther('1.0')),
        data: message2.data,
      };

      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);

      await expect(
        fuelMessagePortal.relayMessage(
          diffBlock,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(
        fuelMessagePortal,
        'InvalidMessageInBlockProof'
      );
    });

    it('Should not be able to relay non-existent message', async () => {
      const [, msgBlockHeader, blockInRoot] = generateProof(
        message2,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      const msgInBlock = {
        key: 0,
        proof: [],
      };
      await expect(
        fuelMessagePortal.relayMessage(
          message2,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(
        fuelMessagePortal,
        'InvalidMessageInBlockProof'
      );
    });

    it('Should not be able to relay reentrant messages', async () => {
      // create a message that attempts to relay another message
      const [, rTestMsgBlockHeader, rTestBlockInRoot, rTestMsgInBlock] =
        generateProof(
          message1,
          blockHeaders,
          prevBlockNodes,
          blockIds,
          messageNodes
        );
      const reentrantTestData = fuelMessagePortal.interface.encodeFunctionData(
        'relayMessage',
        [
          message1,
          endOfCommitIntervalHeaderLite,
          rTestMsgBlockHeader,
          rTestBlockInRoot,
          rTestMsgInBlock,
        ]
      );
      const messageReentrant = new Message(
        trustedSenderAddress,
        b256_fuelMessagePortalAddress,
        BigNumber.from(0),
        randomBytes32(),
        reentrantTestData
      );
      const messageReentrantId = computeMessageId(messageReentrant);
      const messageReentrantMessages = [messageReentrantId];
      const messageReentrantMessageNodes = constructTree(
        messageReentrantMessages
      );

      // create block that contains this message
      const tai64Time = BigNumber.from(
        Math.floor(new Date().getTime() / 1000)
      ).add('4611686018427387914');
      const reentrantTestMessageBlock = createBlock(
        '',
        blockIds.length,
        tai64Time.toHexString(),
        '1',
        calcRoot(messageReentrantMessages)
      );
      const reentrantTestMessageBlockId = computeBlockId(
        reentrantTestMessageBlock
      );
      blockIds.push(reentrantTestMessageBlockId);

      // commit and finalize a block that contains the block with the message
      const reentrantTestRootBlock = createBlock(
        calcRoot(blockIds),
        blockIds.length,
        tai64Time.toHexString()
      );
      const reentrantTestPrevBlockNodes = constructTree(blockIds);
      const reentrantTestRootBlockId = computeBlockId(reentrantTestRootBlock);
      await fuelChainState.commit(reentrantTestRootBlockId, 1);
      ethers.provider.send('evm_increaseTime', [TIME_TO_FINALIZE]);

      // generate proof for relaying reentrant message
      const messageBlockLeafIndexKey = getLeafIndexKey(
        reentrantTestPrevBlockNodes,
        reentrantTestMessageBlockId
      );
      const blockInHistoryProof = {
        key: messageBlockLeafIndexKey,
        proof: getProof(reentrantTestPrevBlockNodes, messageBlockLeafIndexKey),
      };
      const messageLeafIndexKey = getLeafIndexKey(
        messageReentrantMessageNodes,
        messageReentrantId
      );
      const messageInBlockProof = {
        key: messageLeafIndexKey,
        proof: getProof(messageReentrantMessageNodes, messageLeafIndexKey),
      };

      // re-enter via relayMessage
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(messageReentrantId)
      ).to.be.equal(false);
      await expect(
        fuelMessagePortal.relayMessage(
          messageReentrant,
          generateBlockHeaderLite(reentrantTestRootBlock),
          reentrantTestMessageBlock,
          blockInHistoryProof,
          messageInBlockProof
        )
      ).to.be.revertedWith('ReentrancyGuard: reentrant call');
    });
  });
});
