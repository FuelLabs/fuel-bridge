import { constructTree, calcRoot, getProof } from '@fuel-ts/merkle';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber as BN } from 'ethers';
import { deployments, ethers } from 'hardhat';

import type { BlockHeaderLite } from '../protocol/blockHeader';
import type BlockHeader from '../protocol/blockHeader';
import {
  computeBlockId,
  generateBlockHeaderLite,
} from '../protocol/blockHeader';
import type { HarnessObject } from '../protocol/harness';
import Message, { computeMessageId } from '../protocol/message';
import {
  computeMessageData,
  randomAddress,
  randomBytes32,
  tai64Time,
} from '../protocol/utils';
import type {
  FuelChainState,
  FuelERC721Gateway,
  FuelMessagePortal,
  NFT,
} from '../typechain';

import { createBlock } from './utils/createBlock';

const CONTRACT_MESSAGE_PREDICATE =
  '0x86a8f7487cb0d3faca1895173d5ff35c1e839bd2ab88657eede9933ea8988815';

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

type Env = Pick<
  HarnessObject,
  | 'fuelChainState'
  | 'fuelMessagePortal'
  | 'nft'
  | 'fuelERC721Gateway'
  | 'addresses'
  | 'signers'
  | 'deployer'
>;

const fixture = deployments.createFixture(
  async ({ ethers, upgrades: { deployProxy } }) => {
    const signers = await ethers.getSigners();
    const addresses = signers.map((signer) => signer.address);
    const [deployer] = signers;

    const proxyOptions = {
      initializer: 'initialize',
    };

    const NFT = await ethers.getContractFactory('NFT', deployer);
    const nft = (await NFT.deploy()) as NFT;

    const fuelChainState = await ethers
      .getContractFactory('FuelChainState', deployer)
      .then(
        (factory) =>
          deployProxy(factory, [], proxyOptions) as Promise<FuelChainState>
      );

    const fuelMessagePortal = await ethers
      .getContractFactory('FuelMessagePortal', deployer)
      .then(
        (factory) =>
          deployProxy(
            factory,
            [fuelChainState.address],
            proxyOptions
          ) as Promise<FuelMessagePortal>
      );

    const fuelERC721Gateway = await ethers
      .getContractFactory('FuelERC721Gateway', deployer)
      .then(
        (factory) =>
          deployProxy(
            factory,
            [fuelMessagePortal.address],
            proxyOptions
          ) as Promise<FuelERC721Gateway>
      );

    // Mint some dummy token for deposit testing
    for (let i = 0; i < signers.length; i += 1) {
      await nft.mint(await signers[i].getAddress(), i);
    }

    return {
      nft,
      fuelChainState,
      fuelMessagePortal,
      fuelERC721Gateway,
      addresses,
      signers,
      deployer,
    };
  }
);

describe('ERC721 Gateway', async () => {
  let env: Env;

  // Contract constants
  const TIME_TO_FINALIZE = 10800;
  const BLOCKS_PER_COMMIT_INTERVAL = 10800;

  // Message data
  const fuelTokenTarget1 = randomBytes32();
  const fuelTokenTarget2 = randomBytes32();
  const messageIds: string[] = [];
  let messageNodes: TreeNode[];
  let gatewayAddress: string;
  let tokenAddress: string;

  // Messages
  let messageWithdrawal1: Message;
  let messageWithdrawal2: Message;
  let messageWithdrawal3: Message;
  let messageBadL2Token: Message;
  let messageBadL1Token: Message;
  let messageBadSender: Message;

  // Arrays of committed block headers and their IDs
  const blockHeaders: BlockHeader[] = [];
  const blockIds: string[] = [];
  let endOfCommitIntervalHeader: BlockHeader;
  let endOfCommitIntervalHeaderLite: BlockHeaderLite;
  let prevBlockNodes: TreeNode[];

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
    env = await fixture();

    // get data for building messages
    gatewayAddress = env.fuelERC721Gateway.address
      .split('0x')
      .join('0x000000000000000000000000')
      .toLowerCase();
    tokenAddress = env.nft.address;

    // message from trusted sender
    messageWithdrawal1 = new Message(
      fuelTokenTarget1,
      gatewayAddress,
      BN.from(0),
      randomBytes32(),
      env.fuelERC721Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
        env.addresses[2],
        tokenAddress,
        1,
        0,
      ])
    );
    messageWithdrawal2 = new Message(
      fuelTokenTarget2,
      gatewayAddress,
      BN.from(0),
      randomBytes32(),
      env.fuelERC721Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
        env.addresses[3],
        tokenAddress,
        1,
        1,
      ])
    );
    messageWithdrawal3 = new Message(
      fuelTokenTarget1,
      gatewayAddress,
      BN.from(0),
      randomBytes32(),
      env.fuelERC721Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
        env.addresses[3],
        tokenAddress,
        1,
        2,
      ])
    );

    // message with bad L2 token
    messageBadL2Token = new Message(
      randomBytes32(),
      gatewayAddress,
      BN.from(0),
      randomBytes32(),
      env.fuelERC721Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
        env.addresses[3],
        tokenAddress,
        1,
        3,
      ])
    );
    // message with bad L1 token
    messageBadL1Token = new Message(
      fuelTokenTarget2,
      gatewayAddress,
      BN.from(0),
      randomBytes32(),
      env.fuelERC721Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
        env.addresses[3],
        randomAddress(),
        1,
        ethers.constants.HashZero,
      ])
    );
    // message from untrusted sender
    messageBadSender = new Message(
      randomBytes32(),
      gatewayAddress,
      BN.from(0),
      randomBytes32(),
      env.fuelERC721Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
        env.addresses[3],
        tokenAddress,
        1,
        ethers.constants.HashZero,
      ])
    );

    // compile all message IDs
    messageIds.push(computeMessageId(messageWithdrawal1));
    messageIds.push(computeMessageId(messageWithdrawal2));
    messageIds.push(computeMessageId(messageWithdrawal3));
    messageIds.push(computeMessageId(messageBadL2Token));
    messageIds.push(computeMessageId(messageBadL1Token));
    messageIds.push(computeMessageId(messageBadSender));
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
    endOfCommitIntervalHeader = createBlock(
      calcRoot(blockIds),
      blockIds.length,
      tai64Time(new Date().getTime()),
      messageCount,
      messagesRoot
    );
    endOfCommitIntervalHeaderLite = generateBlockHeaderLite(
      endOfCommitIntervalHeader
    );
    prevBlockNodes = constructTree(blockIds);

    // finalize blocks in the state contract
    await env.fuelChainState.commit(
      computeBlockId(endOfCommitIntervalHeader),
      0
    );
    ethers.provider.send('evm_increaseTime', [TIME_TO_FINALIZE]);
  });

  describe('Verify access control', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const pauserRole = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes('PAUSER_ROLE')
    );
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
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer1)
      ).to.equal(false);

      // Grant admin role
      await expect(env.fuelERC721Gateway.grantRole(defaultAdminRole, signer1))
        .to.not.be.reverted;
      expect(
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer1)
      ).to.equal(true);
    });

    it('Should be able to renounce admin role', async () => {
      expect(
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer0)
      ).to.equal(true);

      // Revoke admin role
      await expect(
        env.fuelERC721Gateway.renounceRole(defaultAdminRole, signer0)
      ).to.not.be.reverted;
      expect(
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
    });

    it('Should not be able to grant admin role as non-admin', async () => {
      expect(
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);

      // Attempt grant admin role
      await expect(
        env.fuelERC721Gateway.grantRole(defaultAdminRole, signer0)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[0].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
    });

    it('Should be able to grant then revoke admin role', async () => {
      expect(
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
      expect(
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer1)
      ).to.equal(true);

      // Grant admin role
      await expect(
        env.fuelERC721Gateway
          .connect(env.signers[1])
          .grantRole(defaultAdminRole, signer0)
      ).to.not.be.reverted;
      expect(
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer0)
      ).to.equal(true);

      // Revoke previous admin
      await expect(env.fuelERC721Gateway.revokeRole(defaultAdminRole, signer1))
        .to.not.be.reverted;
      expect(
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer1)
      ).to.equal(false);
    });

    it('Should be able to grant pauser role', async () => {
      expect(await env.fuelERC721Gateway.hasRole(pauserRole, signer1)).to.equal(
        false
      );

      // Grant pauser role
      await expect(env.fuelERC721Gateway.grantRole(pauserRole, signer1)).to.not
        .be.reverted;
      expect(await env.fuelERC721Gateway.hasRole(pauserRole, signer1)).to.equal(
        true
      );
    });

    it('Should not be able to grant permission as pauser', async () => {
      expect(
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer2)
      ).to.equal(false);
      expect(await env.fuelERC721Gateway.hasRole(pauserRole, signer2)).to.equal(
        false
      );

      // Attempt grant admin role
      await expect(
        env.fuelERC721Gateway
          .connect(env.signers[1])
          .grantRole(defaultAdminRole, signer2)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(
        await env.fuelERC721Gateway.hasRole(defaultAdminRole, signer2)
      ).to.equal(false);

      // Attempt grant pauser role
      await expect(
        env.fuelERC721Gateway
          .connect(env.signers[1])
          .grantRole(pauserRole, signer2)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelERC721Gateway.hasRole(pauserRole, signer2)).to.equal(
        false
      );
    });

    it('Should be able to revoke pauser role', async () => {
      expect(await env.fuelERC721Gateway.hasRole(pauserRole, signer1)).to.equal(
        true
      );

      // Grant pauser role
      await expect(env.fuelERC721Gateway.revokeRole(pauserRole, signer1)).to.not
        .be.reverted;
      expect(await env.fuelERC721Gateway.hasRole(pauserRole, signer1)).to.equal(
        false
      );
    });
  });

  describe('Make both valid and invalid ERC721 deposits', async () => {
    it('Should be able to deposit tokens', async () => {
      const testDeposit = async (
        signer: SignerWithAddress,
        fuelTarget: string,
        token: NFT,
        tokenId: BigNumberish
      ) => {
        const toAddress = randomBytes32();

        const expectedMessageData = computeMessageData(
          fuelTarget,
          tokenAddress.split('0x').join('0x000000000000000000000000'),
          tokenId,
          signer.address.split('0x').join('0x000000000000000000000000'),
          toAddress,
          1
        );
        const expectedNonce =
          await env.fuelMessagePortal.getNextOutgoingMessageNonce();
        const expectedAmount = 0;

        await env.nft
          .connect(signer)
          .approve(env.fuelERC721Gateway.address, tokenId);
        await expect(
          env.fuelERC721Gateway
            .connect(signer)
            .deposit(toAddress, token.address, fuelTarget, tokenId)
        )
          .to.emit(env.fuelMessagePortal, 'MessageSent')
          .withArgs(
            gatewayAddress,
            CONTRACT_MESSAGE_PREDICATE,
            expectedNonce,
            expectedAmount,
            expectedMessageData
          );

        expect(await env.nft.ownerOf(tokenId)).to.be.equal(
          env.fuelERC721Gateway.address
        );

        expect(
          await env.fuelERC721Gateway.tokensDeposited(env.nft.address, tokenId)
        ).to.be.equal(fuelTarget);
      };

      // Deposit to fuelTokenTarget1
      {
        const tokenId = 0;
        await testDeposit(
          env.signers[tokenId],
          fuelTokenTarget1,
          env.nft,
          tokenId
        );
      }

      // Deposit to fuelTokenTarget2
      {
        const tokenId = 1;
        await testDeposit(
          env.signers[tokenId],
          fuelTokenTarget2,
          env.nft,
          tokenId
        );
      }
    });

    it('Should be able to deposit tokens with data', async () => {
      const testDepositWithData = async (
        signer: SignerWithAddress,
        fuelTarget: string,
        token: NFT,
        tokenId: BigNumberish,
        data: BytesLike
      ) => {
        const toAddress = randomBytes32();

        const expectedMessageData = computeMessageData(
          fuelTarget,
          tokenAddress.split('0x').join('0x000000000000000000000000'),
          tokenId,
          signer.address.split('0x').join('0x000000000000000000000000'),
          toAddress,
          1,
          data
        );

        const expectedNonce =
          await env.fuelMessagePortal.getNextOutgoingMessageNonce();
        const expectedAmount = 0;

        await env.nft
          .connect(signer)
          .approve(env.fuelERC721Gateway.address, tokenId);
        await expect(
          env.fuelERC721Gateway
            .connect(signer)
            .depositWithData(
              toAddress,
              token.address,
              fuelTarget,
              tokenId,
              data
            )
        )
          .to.emit(env.fuelMessagePortal, 'MessageSent')
          .withArgs(
            gatewayAddress,
            CONTRACT_MESSAGE_PREDICATE,
            expectedNonce,
            expectedAmount,
            expectedMessageData
          );

        expect(await env.nft.ownerOf(tokenId)).to.be.equal(
          env.fuelERC721Gateway.address
        );

        expect(
          await env.fuelERC721Gateway.tokensDeposited(env.nft.address, tokenId)
        ).to.be.equal(fuelTarget);
      };

      // Deposit to fuelTokenTarget1
      {
        const tokenId = 2;
        const depositData = [3, 2, 6, 9, 2, 5];
        await testDepositWithData(
          env.signers[tokenId],
          fuelTokenTarget1,
          env.nft,
          tokenId,
          depositData
        );
      }

      // Deposit to fuelTokenTarget2
      {
        const tokenId = 3;
        const depositData = [3, 2, 6, 9, 2, 5];
        await testDepositWithData(
          env.signers[tokenId],
          fuelTokenTarget2,
          env.nft,
          tokenId,
          depositData
        );
      }
    });

    it('Should be able to deposit tokens with empty data', async () => {
      const testDepositWithEmptyData = async (
        signer: SignerWithAddress,
        fuelTarget: string,
        token: NFT,
        tokenId: BigNumberish
      ) => {
        const toAddress = randomBytes32();

        const expectedMessageData = computeMessageData(
          fuelTarget,
          tokenAddress.split('0x').join('0x000000000000000000000000'),
          tokenId,
          signer.address.split('0x').join('0x000000000000000000000000'),
          toAddress,
          1,
          []
        );

        const expectedNonce =
          await env.fuelMessagePortal.getNextOutgoingMessageNonce();
        const expectedAmount = 0;

        await env.nft
          .connect(signer)
          .approve(env.fuelERC721Gateway.address, tokenId);
        await expect(
          env.fuelERC721Gateway
            .connect(signer)
            .depositWithData(toAddress, token.address, fuelTarget, tokenId, [])
        )
          .to.emit(env.fuelMessagePortal, 'MessageSent')
          .withArgs(
            gatewayAddress,
            CONTRACT_MESSAGE_PREDICATE,
            expectedNonce,
            expectedAmount,
            expectedMessageData
          );

        expect(await env.nft.ownerOf(tokenId)).to.be.equal(
          env.fuelERC721Gateway.address
        );

        expect(
          await env.fuelERC721Gateway.tokensDeposited(env.nft.address, tokenId)
        ).to.be.equal(fuelTarget);
      };

      // Deposit to fuelTokenTarget1
      {
        const tokenId = 4;
        await testDepositWithEmptyData(
          env.signers[tokenId],
          fuelTokenTarget1,
          env.nft,
          tokenId
        );
      }

      // Deposit to fuelTokenTarget1
      {
        const tokenId = 5;
        await testDepositWithEmptyData(
          env.signers[tokenId],
          fuelTokenTarget1,
          env.nft,
          tokenId
        );
      }
    });
  });

  describe('Make both valid and invalid ERC721 withdrawals', async () => {
    it('Should not be able to directly call finalize', async () => {
      await expect(
        env.fuelERC721Gateway.finalizeWithdrawal(
          env.addresses[2],
          tokenAddress,
          BN.from(100),
          ethers.constants.HashZero
        )
      ).to.be.revertedWithCustomError(
        env.fuelERC721Gateway,
        'CallerIsNotPortal'
      );
    });

    it('Should be able to finalize valid withdrawal through portal', async () => {
      const tokenId = 0;
      expect(await env.nft.ownerOf(tokenId)).to.be.equal(
        env.fuelERC721Gateway.address
      );

      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageWithdrawal1,
        23
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);

      await env.fuelMessagePortal.relayMessage(
        messageWithdrawal1,
        endOfCommitIntervalHeaderLite,
        msgBlockHeader,
        blockInRoot,
        msgInBlock
      );

      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);

      expect(await env.nft.ownerOf(tokenId)).to.be.equal(env.addresses[2]);
    });

    it('Should be able to finalize valid withdrawal through portal again', async () => {
      const tokenId = 1;
      expect(await env.nft.ownerOf(tokenId)).to.be.equal(
        env.fuelERC721Gateway.address
      );

      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageWithdrawal2,
        73
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);

      await env.fuelMessagePortal.relayMessage(
        messageWithdrawal2,
        endOfCommitIntervalHeaderLite,
        msgBlockHeader,
        blockInRoot,
        msgInBlock
      );

      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);

      expect(await env.nft.ownerOf(tokenId)).to.be.equal(env.addresses[3]);
    });

    it('Should not be able to finalize withdrawal with bad L2 token', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageBadL2Token,
        85
      );

      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);

      await expect(
        env.fuelMessagePortal.relayMessage(
          messageBadL2Token,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWith('Fuel bridge does not own this token');

      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should not be able to finalize withdrawal with bad L1 token', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageBadL1Token,
        85
      );

      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);

      await expect(
        env.fuelMessagePortal.relayMessage(
          messageBadL1Token,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWith('Fuel bridge does not own this token');

      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should not be able to finalize withdrawal with bad sender', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageBadSender,
        26
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
      ).to.be.revertedWith('Fuel bridge does not own this token');
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });
  });

  describe('Verify pause and unpause', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const pauserRole = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes('PAUSER_ROLE')
    );

    it('Should be able to grant pauser role', async () => {
      expect(
        await env.fuelERC721Gateway.hasRole(pauserRole, env.addresses[2])
      ).to.equal(false);

      // Grant pauser role
      await expect(
        env.fuelERC721Gateway.grantRole(pauserRole, env.addresses[2])
      ).to.not.be.reverted;
      expect(
        await env.fuelERC721Gateway.hasRole(pauserRole, env.addresses[2])
      ).to.equal(true);
    });

    it('Should not be able to pause as non-pauser', async () => {
      expect(await env.fuelERC721Gateway.paused()).to.be.equal(false);

      // Attempt pause
      await expect(
        env.fuelERC721Gateway.connect(env.signers[1]).pause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${pauserRole}`
      );
      expect(await env.fuelERC721Gateway.paused()).to.be.equal(false);
    });

    it('Should be able to pause as pauser', async () => {
      expect(await env.fuelERC721Gateway.paused()).to.be.equal(false);

      // Pause
      await expect(env.fuelERC721Gateway.connect(env.signers[2]).pause()).to.not
        .be.reverted;
      expect(await env.fuelERC721Gateway.paused()).to.be.equal(true);
    });

    it('Should not be able to unpause as pauser (and not admin)', async () => {
      expect(await env.fuelERC721Gateway.paused()).to.be.equal(true);

      // Attempt unpause
      await expect(
        env.fuelERC721Gateway.connect(env.signers[2]).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[2].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelERC721Gateway.paused()).to.be.equal(true);
    });

    it('Should not be able to unpause as non-admin', async () => {
      expect(await env.fuelERC721Gateway.paused()).to.be.equal(true);

      // Attempt unpause
      await expect(
        env.fuelERC721Gateway.connect(env.signers[1]).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelERC721Gateway.paused()).to.be.equal(true);
    });

    it('Should not be able to finalize withdrawal when paused', async () => {
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageWithdrawal3,
        31
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await expect(
        env.fuelMessagePortal.relayMessage(
          messageWithdrawal3,
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

    it('Should not be able to deposit when paused', async () => {
      // Deposit 175 to fuelTokenTarget1
      await expect(
        env.fuelERC721Gateway.deposit(
          randomBytes32(),
          tokenAddress,
          fuelTokenTarget1,
          175
        )
      ).to.be.revertedWith('Pausable: paused');
    });

    it('Should not be able to deposit with data when paused', async () => {
      // Deposit 205 to fuelTokenTarget1
      await expect(
        env.fuelERC721Gateway.depositWithData(
          randomBytes32(),
          tokenAddress,
          fuelTokenTarget1,
          205,
          []
        )
      ).to.be.revertedWith('Pausable: paused');
    });

    it('Should be able to unpause as admin', async () => {
      expect(await env.fuelERC721Gateway.paused()).to.be.equal(true);

      // Unpause
      await expect(env.fuelERC721Gateway.unpause()).to.not.be.reverted;
      expect(await env.fuelERC721Gateway.paused()).to.be.equal(false);
    });

    it('Should be able to finalize withdrawal when unpaused', async () => {
      const tokenId = 2;
      expect(await env.nft.ownerOf(tokenId)).to.be.equal(
        env.fuelERC721Gateway.address
      );
      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageWithdrawal3,
        37
      );
      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
      await env.fuelMessagePortal.relayMessage(
        messageWithdrawal3,
        endOfCommitIntervalHeaderLite,
        msgBlockHeader,
        blockInRoot,
        msgInBlock
      );

      expect(
        await env.fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);

      expect(await env.nft.ownerOf(tokenId)).to.be.equal(env.addresses[3]);
    });

    it('Should be able to revoke pauser role', async () => {
      expect(
        await env.fuelERC721Gateway.hasRole(pauserRole, env.addresses[2])
      ).to.equal(true);

      // Grant pauser role
      await expect(
        env.fuelERC721Gateway.revokeRole(pauserRole, env.addresses[2])
      ).to.not.be.reverted;
      expect(
        await env.fuelERC721Gateway.hasRole(pauserRole, env.addresses[2])
      ).to.equal(false);
    });
  });
});
