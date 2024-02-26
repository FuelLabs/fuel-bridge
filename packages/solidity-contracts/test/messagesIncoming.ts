import { constructTree, calcRoot, getProof } from '@fuel-ts/merkle';
import chai from 'chai';
import type { Provider } from 'ethers';
import {
  keccak256,
  parseEther,
  toBeHex,
  toUtf8Bytes,
  zeroPadValue,
} from 'ethers';
import { ethers } from 'hardhat';

import type { BlockHeaderLite } from '../protocol/blockHeader';
import type BlockHeader from '../protocol/blockHeader';
import {
  computeBlockId,
  generateBlockHeaderLite,
} from '../protocol/blockHeader';
import { EMPTY } from '../protocol/constants';
import { setupFuel } from '../protocol/harness';
import type { HarnessObject } from '../protocol/harness';
import Message, { computeMessageId } from '../protocol/message';
import { randomBytes32, tai64Time } from '../protocol/utils';
import type { MessageTester } from '../typechain';

import { createBlock } from './utils/createBlock';

const { expect } = chai;

// Merkle tree node structure
// TODO: should be importable from @fuel-ts/merkle
declare class TreeNode {
  left: number;
  right: number;
  parent: number;
  hash: string;
  data: string;
  index: number;
}

// Merkle proof class
declare class MerkleProof {
  key: number;
  proof: string[];
}

// Get proof for the leaf
function getLeafIndexKey(nodes: TreeNode[], data: string): number {
  for (let n = 0; n < nodes.length; n += 1) {
    if (nodes[n].data === data) {
      return nodes[n].index;
    }
  }
  return 0;
}

describe('Incoming Messages', async () => {
  let env: HarnessObject;
  let fuelBaseAssetDecimals: bigint;
  let baseAssetConversion: bigint;

  // Contract constants
  const TIME_TO_FINALIZE = 10800;
  const BLOCKS_PER_COMMIT_INTERVAL = 10800;

  // Message data
  const messageTestData1 = randomBytes32();
  const messageTestData2 = randomBytes32();
  const messageTestData3 = randomBytes32();
  let messageNodes: TreeNode[];
  let trustedSenderAddress: string;

  // Testing contracts
  let messageTester: MessageTester;
  let messageTesterAddress: string;
  let fuelMessagePortalContractAddress: string;

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
  const blockHeaders: BlockHeader[] = [];
  const blockIds: string[] = [];
  let endOfCommitIntervalHeader: BlockHeader;
  let endOfCommitIntervalHeaderLite: BlockHeaderLite;
  let unflinalizedBlock: BlockHeader;
  let prevBlockNodes: TreeNode[];

  // Contract addresses
  let fuelMessagePortalAddress: string;

  // Helper function to setup test data
  function generateProof(
    message: Message,
    prevBlockDistance = 1
  ): [string, BlockHeader, MerkleProof, MerkleProof] {
    const messageBlockIndex =
      BLOCKS_PER_COMMIT_INTERVAL - 1 - prevBlockDistance;
    const messageBlockHeader = blockHeaders[messageBlockIndex];
    const messageBlockLeafIndexKey = getLeafIndexKey(
      prevBlockNodes,
      blockIds[messageBlockIndex]
    );
    const blockInHistoryProof = {
      key: messageBlockLeafIndexKey,
      proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
    };
    const messageID = computeMessageId(message);
    const messageLeafIndexKey = getLeafIndexKey(messageNodes, messageID);
    const messageInBlockProof = {
      key: messageLeafIndexKey,
      proof: getProof(messageNodes, messageLeafIndexKey),
    };
    return [
      messageID,
      messageBlockHeader,
      blockInHistoryProof,
      messageInBlockProof,
    ];
  }

  before(async () => {
    env = await setupFuel();
    fuelMessagePortalAddress = await env.fuelMessagePortal.getAddress();
    fuelBaseAssetDecimals = await env.fuelMessagePortal.fuelBaseAssetDecimals();
    baseAssetConversion = 10n ** (18n - fuelBaseAssetDecimals);

    // Deploy contracts for message testing.
    const messageTesterContractFactory = await ethers.getContractFactory(
      'MessageTester',
      env.deployer
    );
    messageTester = (await messageTesterContractFactory
      .deploy(env.fuelMessagePortal)
      .then((tx) => tx.waitForDeployment())) as MessageTester;

    expect(await messageTester.data1()).to.be.equal(0);
    expect(await messageTester.data2()).to.be.equal(0);

    // get data for building messages
    messageTesterAddress = zeroPadValue(await messageTester.getAddress(), 32);
    fuelMessagePortalContractAddress = zeroPadValue(
      fuelMessagePortalAddress,
      32
    );
    trustedSenderAddress = await messageTester.getTrustedSender();

    // message from trusted sender
    message1 = new Message(
      trustedSenderAddress,
      messageTesterAddress,
      0n,
      randomBytes32(),
      messageTester.interface.encodeFunctionData('receiveMessage', [
        messageTestData1,
        messageTestData2,
      ])
    );
    message2 = new Message(
      trustedSenderAddress,
      messageTesterAddress,
      0n,
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
      parseEther('0.1') / baseAssetConversion,
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
      0n,
      randomBytes32(),
      messageTester.interface.encodeFunctionData('receiveMessage', [
        messageTestData3,
        messageTestData1,
      ])
    );
    // message to bad recipient
    messageBadRecipient = new Message(
      trustedSenderAddress,
      fuelMessagePortalContractAddress,
      0n,
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
      0n,
      randomBytes32(),
      randomBytes32()
    );
    // message to EOA
    messageEOA = new Message(
      randomBytes32(),
      env.addresses[2].split('0x').join('0x000000000000000000000000'),
      parseEther('0.1') / baseAssetConversion,
      randomBytes32(),
      '0x'
    );
    // message to EOA no amount
    messageEOANoAmount = new Message(
      randomBytes32(),
      zeroPadValue(env.addresses[3], 32),
      0n,
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
    await env.fuelChainState.commit(
      computeBlockId(endOfCommitIntervalHeader),
      0
    );
    ethers.provider.send('evm_increaseTime', [TIME_TO_FINALIZE]);

    // create an unfinalized block
    unflinalizedBlock = createBlock(
      calcRoot(blockIds),
      BLOCKS_PER_COMMIT_INTERVAL * 11 - 1,
      timestamp,
      messageCount,
      messagesRoot
    );
    await env.fuelChainState.commit(computeBlockId(unflinalizedBlock), 10);

    // make sure the portal has eth to relay
    await env.fuelMessagePortal.depositETH(EMPTY, {
      value: parseEther('0.2'),
    });

    // Verify contract getters
    expect(await env.fuelMessagePortal.fuelChainStateContract()).to.equal(
      await env.fuelChainState.getAddress()
    );
    expect(await messageTester.fuelMessagePortal()).to.equal(
      fuelMessagePortalAddress
    );
  });

  describe('Verify access control', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const pauserRole = keccak256(toUtf8Bytes('PAUSER_ROLE'));
    let signer0: string;
    let signer1: string;
    let signer2: string;
    before(async () => {
      signer0 = env.addresses[0];
      signer1 = env.addresses[1];
      signer2 = env.addresses[2];
    });

    it('Should be able to grant admin role', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)
      ).to.equal(false);

      // Grant admin role
      await expect(env.fuelMessagePortal.grantRole(defaultAdminRole, signer1))
        .to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)
      ).to.equal(true);
    });

    it('Should be able to renounce admin role', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(true);

      // Revoke admin role
      await expect(
        env.fuelMessagePortal.renounceRole(defaultAdminRole, signer0)
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
    });

    it('Should not be able to grant admin role as non-admin', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);

      // Attempt grant admin role
      await expect(
        env.fuelMessagePortal.grantRole(defaultAdminRole, signer0)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[0].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
    });

    it('Should be able to grant then revoke admin role', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)
      ).to.equal(true);

      // Grant admin role
      await expect(
        env.fuelMessagePortal
          .connect(env.signers[1])
          .grantRole(defaultAdminRole, signer0)
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(true);

      // Revoke previous admin
      await expect(env.fuelMessagePortal.revokeRole(defaultAdminRole, signer1))
        .to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)
      ).to.equal(false);
    });

    it('Should be able to grant pauser role', async () => {
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(
        false
      );

      // Grant pauser role
      await expect(env.fuelMessagePortal.grantRole(pauserRole, signer1)).to.not
        .be.reverted;
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(
        true
      );
    });

    it('Should not be able to grant permission as pauser', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer2)
      ).to.equal(false);
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer2)).to.equal(
        false
      );

      // Attempt grant admin role
      await expect(
        env.fuelMessagePortal
          .connect(env.signers[1])
          .grantRole(defaultAdminRole, signer2)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer2)
      ).to.equal(false);

      // Attempt grant pauser role
      await expect(
        env.fuelMessagePortal
          .connect(env.signers[1])
          .grantRole(pauserRole, signer2)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer2)).to.equal(
        false
      );
    });

    it('Should be able to revoke pauser role', async () => {
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(
        true
      );

      // Grant pauser role
      await expect(env.fuelMessagePortal.revokeRole(pauserRole, signer1)).to.not
        .be.reverted;
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(
        false
      );
    });
  });

  describe('Relay both valid and invalid messages', async () => {
    let provider: Provider;
    before(async () => {
      provider = env.deployer.provider;
    });

    it('Should not get a valid message sender outside of relaying', async () => {
      await expect(
        env.fuelMessagePortal.messageSender()
      ).to.be.revertedWithCustomError(
        env.fuelMessagePortal,
        'CurrentMessageSenderNotSet'
      );
    });

    it('Should not be able to call messageable contract directly', async () => {
      await expect(
        messageTester.receiveMessage(messageTestData3, messageTestData3)
      ).to.be.revertedWithCustomError(messageTester, 'CallerIsNotPortal');
    });

    it('Should not be able to relay message with bad root block', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message1,
        24
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          message1,
          generateBlockHeaderLite(
            createBlock('', BLOCKS_PER_COMMIT_INTERVAL * 20 - 1)
          ),
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(env.fuelChainState, 'UnknownBlock');
      await expect(
        env.fuelMessagePortal.relayMessage(
          message1,
          generateBlockHeaderLite(unflinalizedBlock),
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(
        env.fuelMessagePortal,
        'UnfinalizedBlock'
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should not be able to relay message with bad proof in root block', async () => {
      const portalBalance = await provider.getBalance(fuelMessagePortalAddress);
      const messageTesterBalance = await provider.getBalance(messageTester);
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message1,
        67
      );
      blockInRoot.key = blockInRoot.key + 1;
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          message1,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(
        env.fuelMessagePortal,
        'InvalidBlockInHistoryProof'
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      expect(await provider.getBalance(fuelMessagePortalAddress)).to.be.equal(
        portalBalance
      );
      expect(await provider.getBalance(messageTester)).to.be.equal(
        messageTesterBalance
      );
    });

    it('Should be able to relay valid message', async () => {
      const portalBalance = await provider.getBalance(fuelMessagePortalAddress);
      const messageTesterBalance = await provider.getBalance(messageTester);
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message1,
        22
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          message1,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
      expect(await messageTester.data1()).to.be.equal(messageTestData1);
      expect(await messageTester.data2()).to.be.equal(messageTestData2);
      expect(await provider.getBalance(fuelMessagePortalAddress)).to.be.equal(
        portalBalance
      );
      expect(await provider.getBalance(messageTester)).to.be.equal(
        messageTesterBalance
      );
    });

    it('Should not be able to relay already relayed message', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message1,
        68
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
      await expect(
        env.fuelMessagePortal.relayMessage(
          message1,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(env.fuelMessagePortal, 'AlreadyRelayed');
    });

    it('Should not be able to relay message with low gas', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageWithAmount,
        11
      );
      const options = {
        gasLimit: 140000,
      };
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          messageWithAmount,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock,
          options
        )
      ).to.be.reverted;
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should be able to relay message with amount', async () => {
      const portalBalance = await provider.getBalance(fuelMessagePortalAddress);
      const messageTesterBalance = await provider.getBalance(messageTester);
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageWithAmount,
        33
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          messageWithAmount,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
      expect(await messageTester.data1()).to.be.equal(messageTestData2);
      expect(await messageTester.data2()).to.be.equal(messageTestData3);
      expect(await provider.getBalance(fuelMessagePortalAddress)).to.be.equal(
        portalBalance - messageWithAmount.amount * baseAssetConversion
      );
      expect(await provider.getBalance(messageTester)).to.be.equal(
        messageTesterBalance + messageWithAmount.amount * baseAssetConversion
      );
    });

    it('Should not be able to relay message from untrusted sender', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageBadSender,
        47
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          messageBadSender,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(messageTester, 'InvalidMessageSender');
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should not be able to relay message to bad recipient', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageBadRecipient,
        69
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          messageBadRecipient,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWith('Message relay failed');
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should not be able to relay message with bad data', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageBadData,
        21
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          messageBadData,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWith('Message relay failed');
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should be able to relay message to EOA', async () => {
      const accountBalance = await provider.getBalance(env.addresses[2]);
      const portalBalance = await provider.getBalance(fuelMessagePortalAddress);
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageEOA,
        19
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          messageEOA,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
      expect(await provider.getBalance(env.addresses[2])).to.be.equal(
        accountBalance + messageEOA.amount * baseAssetConversion
      );
      expect(await provider.getBalance(fuelMessagePortalAddress)).to.be.equal(
        portalBalance - messageEOA.amount * baseAssetConversion
      );
    });

    it('Should be able to relay message to EOA with no amount', async () => {
      const accountBalance = await provider.getBalance(env.addresses[3]);
      const portalBalance = await provider.getBalance(fuelMessagePortalAddress);
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageEOANoAmount,
        25
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          messageEOANoAmount,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
      expect(await provider.getBalance(env.addresses[3])).to.be.equal(
        accountBalance
      );
      expect(await provider.getBalance(fuelMessagePortalAddress)).to.be.equal(
        portalBalance
      );
    });

    it('Should not be able to relay valid message with different amount', async () => {
      const portalBalance = await provider.getBalance(fuelMessagePortalAddress);
      const messageTesterBalance = await provider.getBalance(messageTester);
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message2,
        68
      );
      const diffBlock = {
        sender: message2.sender,
        recipient: message2.recipient,
        nonce: message2.nonce,
        amount: message2.amount + parseEther('1.0'),
        data: message2.data,
      };
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          diffBlock,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(
        env.fuelMessagePortal,
        'InvalidMessageInBlockProof'
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      expect(await provider.getBalance(fuelMessagePortalAddress)).to.be.equal(
        portalBalance
      );
      expect(await provider.getBalance(messageTester)).to.be.equal(
        messageTesterBalance
      );
    });

    it('Should not be able to relay non-existent message', async () => {
      const [, msgBlockHeader, blockInRoot] = generateProof(message2, 1);
      const portalBalance = await provider.getBalance(fuelMessagePortalAddress);
      const messageTesterBalance = await provider.getBalance(messageTester);
      const msgInBlock = {
        key: 0,
        proof: [],
      };
      await expect(
        env.fuelMessagePortal.relayMessage(
          message2,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(
        env.fuelMessagePortal,
        'InvalidMessageInBlockProof'
      );
      expect(await provider.getBalance(fuelMessagePortalAddress)).to.be.equal(
        portalBalance
      );
      expect(await provider.getBalance(messageTester)).to.be.equal(
        messageTesterBalance
      );
    });

    it('Should not be able to relay reentrant messages', async () => {
      // create a message that attempts to relay another message
      const [, rTestMsgBlockHeader, rTestBlockInRoot, rTestMsgInBlock] =
        generateProof(message1, 5);
      const reentrantTestData =
        env.fuelMessagePortal.interface.encodeFunctionData('relayMessage', [
          message1,
          endOfCommitIntervalHeaderLite,
          rTestMsgBlockHeader,
          rTestBlockInRoot,
          rTestMsgInBlock,
        ]);
      const messageReentrant = new Message(
        trustedSenderAddress,
        fuelMessagePortalContractAddress,
        0n,
        randomBytes32(),
        reentrantTestData
      );
      const messageReentrantId = computeMessageId(messageReentrant);
      const messageReentrantMessages = [messageReentrantId];
      const messageReentrantMessageNodes = constructTree(
        messageReentrantMessages
      );

      // create block that contains this message
      const tai64Time =
        BigInt(Math.floor(new Date().getTime() / 1000)) + 4611686018427387914n;

      const reentrantTestMessageBlock = createBlock(
        '',
        blockIds.length,
        toBeHex(tai64Time),
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
        toBeHex(tai64Time)
      );
      const reentrantTestPrevBlockNodes = constructTree(blockIds);
      const reentrantTestRootBlockId = computeBlockId(reentrantTestRootBlock);
      await env.fuelChainState.commit(reentrantTestRootBlockId, 1);
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
        await env.fuelMessagePortal.incomingMessageSuccessful(
          messageReentrantId
        )
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          messageReentrant,
          generateBlockHeaderLite(reentrantTestRootBlock),
          reentrantTestMessageBlock,
          blockInHistoryProof,
          messageInBlockProof
        )
      ).to.be.revertedWith('ReentrancyGuard: reentrant call');
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(
          messageReentrantId
        )
      ).to.be.equal(false);
    });
  });

  describe('Verify pause and unpause', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const pauserRole = keccak256(toUtf8Bytes('PAUSER_ROLE'));

    it('Should be able to grant pauser role', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])
      ).to.equal(false);

      // Grant pauser role
      await expect(
        env.fuelMessagePortal.grantRole(pauserRole, env.addresses[2])
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])
      ).to.equal(true);
    });

    it('Should not be able to pause as non-pauser', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(false);

      // Attempt pause
      await expect(
        env.fuelMessagePortal.connect(env.signers[1]).pause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${pauserRole}`
      );
      expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
    });

    it('Should be able to pause as pauser', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(false);

      // Pause
      await expect(env.fuelMessagePortal.connect(env.signers[2]).pause()).to.not
        .be.reverted;
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
    });

    it('Should not be able to unpause as pauser (and not admin)', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

      // Attempt unpause
      await expect(
        env.fuelMessagePortal.connect(env.signers[2]).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[2].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
    });

    it('Should not be able to unpause as non-admin', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

      // Attempt unpause
      await expect(
        env.fuelMessagePortal.connect(env.signers[1]).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
    });

    it('Should not be able to relay messages when paused', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message2,
        51
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          message2,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWith('Pausable: paused');
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should be able to unpause as admin', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

      // Unpause
      await expect(env.fuelMessagePortal.unpause()).to.not.be.reverted;
      expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
    });

    it('Should be able to relay message when unpaused', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        message2,
        1
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          message2,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
      expect(await messageTester.data1()).to.be.equal(messageTestData2);
      expect(await messageTester.data2()).to.be.equal(messageTestData1);
    });

    it('Should be able to revoke pauser role', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])
      ).to.equal(true);

      // Grant pauser role
      await expect(
        env.fuelMessagePortal.revokeRole(pauserRole, env.addresses[2])
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])
      ).to.equal(false);
    });
  });
});
