import { calcRoot, constructTree, getProof } from '@fuel-ts/merkle';
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import {
  MaxUint256,
  parseEther,
  toBeHex,
  type Provider,
  Wallet,
  ZeroAddress,
} from 'ethers';
import { deployments, ethers, upgrades } from 'hardhat';

import type BlockHeader from '../protocol/blockHeader';
import type { BlockHeaderLite } from '../protocol/blockHeader';
import {
  computeBlockId,
  generateBlockHeaderLite,
} from '../protocol/blockHeader';
import { RATE_LIMIT_AMOUNT, RATE_LIMIT_DURATION } from '../protocol/constants';
import Message, { computeMessageId } from '../protocol/message';
import { randomBytes32, tai64Time } from '../protocol/utils';
import type {
  FuelChainState,
  MessageTester,
  FuelMessagePortalV3,
} from '../typechain';

import { createRandomWalletWithFunds } from './utils';
import { addressToB256, b256ToAddress } from './utils/addressConversion';
import { createBlock } from './utils/createBlock';
import type { TreeNode } from './utils/merkle';
import {
  BLOCKS_PER_COMMIT_INTERVAL,
  COMMIT_COOLDOWN,
  TIME_TO_FINALIZE,
  generateProof,
  getLeafIndexKey,
} from './utils/merkle';

const ETH_DECIMALS = 18n;
const FUEL_BASE_ASSET_DECIMALS = 9n;
const BASE_ASSET_CONVERSION = 10n ** (ETH_DECIMALS - FUEL_BASE_ASSET_DECIMALS);

describe('FuelMessagePortalV3 - Incoming messages', () => {
  let provider: Provider;
  let addresses: string[];
  let signers: HardhatEthersSigner[];
  let fuelMessagePortal: FuelMessagePortalV3;
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
  let messageWithLargeAmount: Message;
  let messageBadSender: Message;
  let messageBadRecipient: Message;
  let messageBadData: Message;
  let messageExceedingRateLimit: Message;
  let messageAfterRateLimitDurationCompletes: Message;
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
    messageTesterAddress = addressToB256(await messageTester.getAddress());
    b256_fuelMessagePortalAddress = addressToB256(portalAddr);

    trustedSenderAddress = await messageTester.getTrustedSender();

    // message from trusted sender
    message1 = new Message(
      trustedSenderAddress,
      messageTesterAddress,
      BigInt(0),
      randomBytes32(),
      messageTester.interface.encodeFunctionData('receiveMessage', [
        messageTestData1,
        messageTestData2,
      ])
    );
    message2 = new Message(
      trustedSenderAddress,
      messageTesterAddress,
      BigInt(0),
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
      parseEther('0.1') / BASE_ASSET_CONVERSION,
      randomBytes32(),
      messageTester.interface.encodeFunctionData('receiveMessage', [
        messageTestData2,
        messageTestData3,
      ])
    );
    // message from trusted sender with large amount
    messageWithLargeAmount = new Message(
      trustedSenderAddress,
      messageTesterAddress,
      parseEther('7') / BASE_ASSET_CONVERSION,
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
      BigInt(0),
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
      BigInt(0),
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
      BigInt(0),
      randomBytes32(),
      randomBytes32()
    );
    // message with exceeded rate limit
    messageExceedingRateLimit = new Message(
      randomBytes32(),
      addressToB256(addresses[2]),
      parseEther('11') / BASE_ASSET_CONVERSION,
      randomBytes32(),
      '0x'
    );
    // message after rate limit duration is over
    messageAfterRateLimitDurationCompletes = new Message(
      randomBytes32(),
      addressToB256(addresses[2]),
      parseEther('5') / BASE_ASSET_CONVERSION,
      randomBytes32(),
      '0x'
    );
    // message to EOA
    messageEOA = new Message(
      randomBytes32(),
      addressToB256(addresses[2]),
      parseEther('0.1') / BASE_ASSET_CONVERSION,
      randomBytes32(),
      '0x'
    );
    // message to EOA no amount
    messageEOANoAmount = new Message(
      randomBytes32(),
      addressToB256(addresses[3]),
      BigInt(0),
      randomBytes32(),
      '0x'
    );

    // compile all message IDs
    const messageIds: string[] = [];
    messageIds.push(computeMessageId(message1));
    messageIds.push(computeMessageId(message2));
    messageIds.push(computeMessageId(messageWithAmount));
    messageIds.push(computeMessageId(messageWithLargeAmount));
    messageIds.push(computeMessageId(messageBadSender));
    messageIds.push(computeMessageId(messageBadRecipient));
    messageIds.push(computeMessageId(messageBadData));
    messageIds.push(computeMessageId(messageExceedingRateLimit));
    messageIds.push(computeMessageId(messageAfterRateLimitDurationCompletes));
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

      const upgradeProxyOptions = {
        initializer: 'reinitializeV3',
      };

      const fuelChainState = (await ethers
        .getContractFactory('FuelChainState', deployer)
        .then(async (factory) =>
          deployProxy(factory, [], {
            ...proxyOptions,
            constructorArgs: [
              TIME_TO_FINALIZE,
              BLOCKS_PER_COMMIT_INTERVAL,
              COMMIT_COOLDOWN,
            ],
          })
        )
        .then((tx) => tx.waitForDeployment())) as FuelChainState;

      const deployment = await ethers
        .getContractFactory('FuelMessagePortal', deployer)
        .then(async (factory) =>
          deployProxy(
            factory,
            [await fuelChainState.getAddress()],
            proxyOptions
          )
        )
        .then((tx) => tx.waitForDeployment());

      const V2Implementation = await ethers.getContractFactory(
        'FuelMessagePortalV2'
      );

      const V3Implementation = await ethers.getContractFactory(
        'FuelMessagePortalV3'
      );

      const fuelMessagePortal = V3Implementation.attach(deployment).connect(
        deployment.runner
      ) as FuelMessagePortalV3;

      const messageTester = await ethers
        .getContractFactory('MessageTester', deployer)
        .then(
          async (factory) =>
            factory.deploy(fuelMessagePortal) as Promise<MessageTester>
        );

      return {
        provider,
        deployer,
        signers,
        fuelMessagePortal,
        fuelChainState,
        V2Implementation,
        V3Implementation,
        messageTester,
        addresses: signers.map(({ address }) => address),
        upgradeProxyOptions,
      };
    }
  );

  it('can upgrade from V1 to V2 to V3', async () => {
    const {
      fuelMessagePortal,
      V2Implementation,
      V3Implementation,
      upgradeProxyOptions,
    } = await fixture();

    await expect(fuelMessagePortal.depositLimitGlobal()).to.be.reverted;

    await upgrades.upgradeProxy(fuelMessagePortal, V2Implementation, {
      unsafeAllow: ['constructor'],
      constructorArgs: [0],
    });

    await expect(fuelMessagePortal.pauseWithdrawals()).to.be.reverted;

    await upgrades.upgradeProxy(fuelMessagePortal, V3Implementation, {
      unsafeAllow: ['constructor'],
      constructorArgs: [0, RATE_LIMIT_DURATION],
      call: { fn: 'reinitializeV3', args: [RATE_LIMIT_AMOUNT.toString()] },
      ...upgradeProxyOptions,
    });

    await fuelMessagePortal.pauseWithdrawals();
    expect(await fuelMessagePortal.withdrawalsPaused()).to.be.true;
  });

  describe('Behaves like V3', () => {
    beforeEach('fixture', async () => {
      const fixt = await fixture();
      const { V2Implementation, V3Implementation, upgradeProxyOptions } = fixt;
      ({
        provider,
        fuelMessagePortal,
        fuelChainState,
        messageTester,
        addresses,
        signers,
      } = fixt);

      await upgrades.upgradeProxy(fuelMessagePortal, V2Implementation, {
        unsafeAllow: ['constructor'],
        constructorArgs: [MaxUint256],
      });

      await upgrades.upgradeProxy(fuelMessagePortal, V3Implementation, {
        unsafeAllow: ['constructor'],
        constructorArgs: [MaxUint256, RATE_LIMIT_DURATION],
        call: { fn: 'reinitializeV3', args: [RATE_LIMIT_AMOUNT.toString()] },
        ...upgradeProxyOptions,
      });

      await setupMessages(
        await fuelMessagePortal.getAddress(),
        messageTester,
        fuelChainState,
        addresses
      );
    });

    describe('pauseWithdrawals', () => {
      it('pauses all withdrawals', async () => {
        const [, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
          messageEOA,
          blockHeaders,
          prevBlockNodes,
          blockIds,
          messageNodes
        );

        await fuelMessagePortal.pauseWithdrawals();
        expect(await fuelMessagePortal.withdrawalsPaused()).to.be.true;

        const relayTx = fuelMessagePortal.relayMessage(
          messageEOA,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        );

        await expect(relayTx).to.be.revertedWithCustomError(
          fuelMessagePortal,
          'WithdrawalsPaused'
        );
      });
    });

    describe('unpauseWithdrawals', () => {
      it('unpauses withdrawals', async () => {
        const withdrawnAmount = messageEOA.amount * BASE_ASSET_CONVERSION;
        const depositedAmount = withdrawnAmount * 2n;
        await fuelMessagePortal.depositETH(messageEOA.recipient, {
          value: depositedAmount,
        });

        await fuelMessagePortal.pauseWithdrawals();
        const [, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
          messageEOA,
          blockHeaders,
          prevBlockNodes,
          blockIds,
          messageNodes
        );

        await fuelMessagePortal.unpauseWithdrawals();
        expect(await fuelMessagePortal.withdrawalsPaused()).to.be.false;

        const relayTx = fuelMessagePortal.relayMessage(
          messageEOA,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        );

        await expect(relayTx).not.to.be.reverted;
      });
    });

    describe('addMessageToBlacklist', () => {
      it('can only be called by pauser role', async () => {
        const mallory = await createRandomWalletWithFunds();

        const [msgID] = generateProof(
          messageEOA,
          blockHeaders,
          prevBlockNodes,
          blockIds,
          messageNodes
        );

        const PAUSER_ROLE = await fuelMessagePortal.PAUSER_ROLE();

        const tx = fuelMessagePortal
          .connect(mallory)
          .addMessageToBlacklist(msgID);

        const expectedErrorMsg =
          `AccessControl: account ${mallory.address.toLowerCase()} ` +
          `is missing role ${PAUSER_ROLE}`;

        await expect(tx).to.be.revertedWith(expectedErrorMsg);
      });

      it('prevents withdrawals', async () => {
        // Blacklisted message
        {
          const [msgID, msgBlockHeader, blockInRoot, msgInBlock] =
            generateProof(
              messageEOA,
              blockHeaders,
              prevBlockNodes,
              blockIds,
              messageNodes
            );

          await fuelMessagePortal.addMessageToBlacklist(msgID);

          const relayTx = fuelMessagePortal.relayMessage(
            messageEOA,
            endOfCommitIntervalHeaderLite,
            msgBlockHeader,
            blockInRoot,
            msgInBlock
          );

          await expect(relayTx).to.be.revertedWithCustomError(
            fuelMessagePortal,
            'MessageBlacklisted'
          );
        }

        // Non blacklisted message
        {
          const [msgID, msgBlockHeader, blockInRoot, msgInBlock] =
            generateProof(
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
        }
      });
    });

    describe('removeMessageFromBlacklist', () => {
      it('can only be called by admin role', async () => {
        const mallory = await createRandomWalletWithFunds();
        const [msgID] = generateProof(
          messageEOA,
          blockHeaders,
          prevBlockNodes,
          blockIds,
          messageNodes
        );

        const ADMIN_ROLE = await fuelMessagePortal.DEFAULT_ADMIN_ROLE();
        const tx = fuelMessagePortal
          .connect(mallory)
          .removeMessageFromBlacklist(msgID);

        const expectedErrorMsg =
          `AccessControl: account ${mallory.address.toLowerCase()} ` +
          `is missing role ${ADMIN_ROLE}`;
        expect(tx).to.be.revertedWith(expectedErrorMsg);
      });
      it('restores ability to withdraw', async () => {
        // Whitelist back the blacklisted message
        {
          const [msgID, msgBlockHeader, blockInRoot, msgInBlock] =
            generateProof(
              messageEOA,
              blockHeaders,
              prevBlockNodes,
              blockIds,
              messageNodes
            );

          const withdrawnAmount = messageEOA.amount * BASE_ASSET_CONVERSION;
          const depositedAmount = withdrawnAmount * 2n;
          await fuelMessagePortal.depositETH(messageEOA.recipient, {
            value: depositedAmount,
          });
          await fuelMessagePortal.removeMessageFromBlacklist(msgID);

          const relayTx = fuelMessagePortal.relayMessage(
            messageEOA,
            endOfCommitIntervalHeaderLite,
            msgBlockHeader,
            blockInRoot,
            msgInBlock
          );

          await expect(relayTx).not.to.be.reverted;
        }
      });
    });

    describe('setFuelChainState()', () => {
      it('can only be called by DEFAULT_ADMIN_ROLE', async () => {
        const [deployer] = await ethers.getSigners();

        const mallory = Wallet.createRandom(provider);
        deployer.sendTransaction({ to: mallory, value: parseEther('1') });

        const defaultAdminRole = await fuelMessagePortal.DEFAULT_ADMIN_ROLE();

        const rogueTx = fuelMessagePortal
          .connect(mallory)
          .setFuelChainState(ZeroAddress);
        const expectedErrorMsg =
          `AccessControl: account ${(
            await mallory.getAddress()
          ).toLowerCase()}` + ` is missing role ${defaultAdminRole}`;

        await expect(rogueTx).to.be.revertedWith(expectedErrorMsg);

        await fuelMessagePortal
          .connect(deployer)
          .grantRole(defaultAdminRole, mallory);

        const tx = fuelMessagePortal
          .connect(mallory)
          .setFuelChainState(ZeroAddress);

        await expect(tx).not.to.be.reverted;
      });

      it('changes the fuel chain state address', async () => {
        const [deployer] = await ethers.getSigners();
        const newFuelChainStateAddress = Wallet.createRandom().address;
        const oldFuelChainStateAddress =
          await fuelMessagePortal.fuelChainStateContract();

        const receipt = await fuelMessagePortal
          .setFuelChainState(newFuelChainStateAddress)
          .then((tx) => tx.wait());

        const [event] = await fuelMessagePortal.queryFilter(
          fuelMessagePortal.filters.FuelChainStateUpdated,
          receipt?.blockNumber,
          receipt?.blockNumber
        );

        expect(event.args.sender).to.equal(deployer.address);
        expect(event.args.oldValue).to.equal(oldFuelChainStateAddress);
        expect(event.args.newValue).to.equal(newFuelChainStateAddress);

        expect(await fuelMessagePortal.fuelChainStateContract()).to.equal(
          newFuelChainStateAddress
        );
      });
    });

    describe('updateRateLimitStatus()', () => {
      it('can only be called by SET_RATE_LIMITER_ROLE', async () => {
        const [deployer] = await ethers.getSigners();

        const mallory = Wallet.createRandom(provider);
        await deployer.sendTransaction({ to: mallory, value: parseEther('1') });

        const setRateLimiterRole =
          await fuelMessagePortal.SET_RATE_LIMITER_ROLE();
        const rogueTx = fuelMessagePortal
          .connect(mallory)
          .updateRateLimitStatus(false);
        const expectedErrorMsg =
          `AccessControl: account ${(
            await mallory.getAddress()
          ).toLowerCase()}` + ` is missing role ${setRateLimiterRole}`;

        await expect(rogueTx).to.be.revertedWith(expectedErrorMsg);

        await fuelMessagePortal
          .connect(deployer)
          .grantRole(setRateLimiterRole, mallory);

        const tx = fuelMessagePortal
          .connect(mallory)
          .updateRateLimitStatus(false);

        await expect(tx).not.to.be.reverted;
      });
    });

    describe('resetRateLimitAmoint()', () => {
      it('can only be called by SET_RATE_LIMITER_ROLE', async () => {
        const [deployer] = await ethers.getSigners();

        const mallory = Wallet.createRandom(provider);
        await deployer.sendTransaction({ to: mallory, value: parseEther('1') });

        const setRateLimiterRole =
          await fuelMessagePortal.SET_RATE_LIMITER_ROLE();
        const rogueTx = fuelMessagePortal
          .connect(mallory)
          .resetRateLimitAmount(0);
        const expectedErrorMsg =
          `AccessControl: account ${(
            await mallory.getAddress()
          ).toLowerCase()}` + ` is missing role ${setRateLimiterRole}`;

        await expect(rogueTx).to.be.revertedWith(expectedErrorMsg);

        await fuelMessagePortal
          .connect(deployer)
          .grantRole(setRateLimiterRole, mallory);

        const tx = fuelMessagePortal.connect(mallory).resetRateLimitAmount(0);

        await expect(tx).not.to.be.reverted;
      });
    });
  });

  describe('V3 Proxy Initialization', () => {
    it('v3 proxy cannot be initialized again', async () => {
      const [deployer] = await ethers.getSigners();
      const fcsAddress = await fuelChainState.getAddress();

      const portal = (await ethers
        .getContractFactory('FuelMessagePortalV3', deployer)
        .then(async (factory) =>
          upgrades.deployProxy(factory, [fcsAddress, 0], {
            initializer: 'initializerV3',
            constructorArgs: [MaxUint256, 0],
          })
        )
        .then((tx) => tx.waitForDeployment())) as FuelMessagePortalV3;

      let tx = portal.reinitializeV3(MaxUint256);
      await expect(tx).to.be.revertedWith(
        'Initializable: contract is already initialized'
      );

      tx = portal.initializerV3(fcsAddress, 0);
      await expect(tx).to.be.revertedWith(
        'Initializable: contract is already initialized'
      );

      tx = portal.initialize(fcsAddress);
      await expect(tx).to.be.revertedWithCustomError(portal, 'NotSupported');
    });
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
        unsafeAllow: ['constructor'],
        constructorArgs: [MaxUint256],
      });

      await setupMessages(
        await fuelMessagePortal.getAddress(),
        messageTester,
        fuelChainState,
        addresses
      );
    });

    // Simulates the case when withdrawn amount < initial deposited amount
    it('should update the amount of deposited ether', async () => {
      const recipient = b256ToAddress(messageEOA.recipient);
      const txSender = signers.find((_, i) => addresses[i] === recipient);
      const withdrawnAmount = messageEOA.amount * BASE_ASSET_CONVERSION;
      const depositedAmount = withdrawnAmount * 2n;

      await fuelMessagePortal
        .connect(txSender)
        .depositETH(messageEOA.recipient, {
          value: depositedAmount,
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
        [await fuelMessagePortal.getAddress(), recipient],
        [withdrawnAmount * -1n, withdrawnAmount]
      );

      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);

      const expectedDepositedAmount = depositedAmount - withdrawnAmount;
      expect(await fuelMessagePortal.totalDeposited()).to.be.equal(
        expectedDepositedAmount
      );
    });
  });

  // This is essentially a copy - paste from `messagesIncoming.ts`
  describe('Behaves like V1 - Relay both valid and invalid messages', async () => {
    before(async () => {
      const fixt = await fixture();
      const { V3Implementation, upgradeProxyOptions } = fixt;
      ({
        provider,
        fuelMessagePortal,
        fuelChainState,
        messageTester,
        addresses,
      } = fixt);

      await upgrades.upgradeProxy(fuelMessagePortal, V3Implementation, {
        unsafeAllow: ['constructor'],
        constructorArgs: [MaxUint256, RATE_LIMIT_DURATION],
        call: { fn: 'reinitializeV3', args: [RATE_LIMIT_AMOUNT.toString()] },
        ...upgradeProxyOptions,
      });

      await fuelMessagePortal.updateRateLimitStatus(true);

      await setupMessages(
        await fuelMessagePortal.getAddress(),
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
      const portalBalance = await provider.getBalance(fuelMessagePortal);
      const messageTesterBalance = await provider.getBalance(messageTester);
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
      expect(await provider.getBalance(fuelMessagePortal)).to.be.equal(
        portalBalance
      );
      expect(await provider.getBalance(messageTester)).to.be.equal(
        messageTesterBalance
      );
    });

    it('Should be able to relay valid message', async () => {
      const portalBalance = await provider.getBalance(fuelMessagePortal);
      const messageTesterBalance = await provider.getBalance(messageTester);
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
      expect(await provider.getBalance(fuelMessagePortal)).to.be.equal(
        portalBalance
      );
      expect(await provider.getBalance(messageTester)).to.be.equal(
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
      const expectedWithdrawnAmount =
        messageWithAmount.amount * BASE_ASSET_CONVERSION;

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
        [fuelMessagePortal, messageTester],
        [expectedWithdrawnAmount * -1n, expectedWithdrawnAmount]
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);

      expect(await messageTester.data1()).to.be.equal(messageTestData2);
      expect(await messageTester.data2()).to.be.equal(messageTestData3);
    });

    it('current withdrawal amount does not change if the new rate limit is less than current withdrawal amount', async () => {
      const expectedWithdrawnAmount =
        messageWithLargeAmount.amount * BASE_ASSET_CONVERSION;

      await fuelMessagePortal.depositETH(messageWithLargeAmount.sender, {
        value: expectedWithdrawnAmount,
      });

      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageWithLargeAmount,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);

      await fuelMessagePortal.relayMessage(
        messageWithLargeAmount,
        endOfCommitIntervalHeaderLite,
        msgBlockHeader,
        blockInRoot,
        msgInBlock
      );

      const currentWithdrawnAmountBeforeSettingLimit =
        await fuelMessagePortal.currentPeriodAmount();

      const rateLimitAmount = RATE_LIMIT_AMOUNT / 2;

      await fuelMessagePortal.resetRateLimitAmount(rateLimitAmount.toString());

      const currentWithdrawnAmountAfterSettingLimit =
        await fuelMessagePortal.currentPeriodAmount();

      expect(currentWithdrawnAmountAfterSettingLimit).to.be.equal(
        expectedWithdrawnAmount +
          messageWithAmount.amount * BASE_ASSET_CONVERSION
      );

      expect(currentWithdrawnAmountAfterSettingLimit).to.be.equal(
        currentWithdrawnAmountBeforeSettingLimit
      );
    });

    it('current withdrawal amount is set to default when rate limit is reset after the duration', async () => {
      ethers.provider.send('evm_increaseTime', [RATE_LIMIT_DURATION * 2]);

      await fuelMessagePortal.resetRateLimitAmount(
        RATE_LIMIT_AMOUNT.toString()
      );

      const currentWithdrawnAmountAfterSettingLimit =
        await fuelMessagePortal.currentPeriodAmount();

      expect(currentWithdrawnAmountAfterSettingLimit).to.be.equal(0n);
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
      ).to.be.revertedWithCustomError(fuelMessagePortal, 'MessageRelayFailed');
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
      ).to.be.revertedWithCustomError(fuelMessagePortal, 'MessageRelayFailed');
      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);
    });

    it('Should be able to relay message after rate limit duration is over', async () => {
      await fuelMessagePortal.depositETH(messageEOA.sender, {
        value:
          messageAfterRateLimitDurationCompletes.amount * BASE_ASSET_CONVERSION,
      });

      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageAfterRateLimitDurationCompletes,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );

      ethers.provider.send('evm_increaseTime', [RATE_LIMIT_DURATION * 2]);

      await fuelMessagePortal.relayMessage(
        messageAfterRateLimitDurationCompletes,
        endOfCommitIntervalHeaderLite,
        msgBlockHeader,
        blockInRoot,
        msgInBlock
      );

      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
    });

    it('Should not be able to relay message with withdrawal amount exceeding rate limit', async () => {
      await fuelMessagePortal.depositETH(messageEOA.sender, {
        value: messageExceedingRateLimit.amount * BASE_ASSET_CONVERSION,
      });

      const [msgID, msgBlockHeader, blockInRoot, msgInBlock] = generateProof(
        messageExceedingRateLimit,
        blockHeaders,
        prevBlockNodes,
        blockIds,
        messageNodes
      );

      await expect(
        fuelMessagePortal.relayMessage(
          messageExceedingRateLimit,
          endOfCommitIntervalHeaderLite,
          msgBlockHeader,
          blockInRoot,
          msgInBlock
        )
      ).to.be.revertedWithCustomError(fuelMessagePortal, 'RateLimitExceeded');

      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(false);

      await fuelMessagePortal.updateRateLimitStatus(false);

      await fuelMessagePortal.relayMessage(
        messageExceedingRateLimit,
        endOfCommitIntervalHeaderLite,
        msgBlockHeader,
        blockInRoot,
        msgInBlock
      );

      expect(
        await fuelMessagePortal.incomingMessageSuccessful(msgID)
      ).to.be.equal(true);
    });

    it('Should be able to relay message to EOA', async () => {
      const expectedWithdrawnAmount = messageEOA.amount * BASE_ASSET_CONVERSION;
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
        [fuelMessagePortal, expectedRecipient],
        [expectedWithdrawnAmount * -1n, expectedWithdrawnAmount]
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
        [fuelMessagePortal, messageRecipient],
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
        amount: message2.amount + parseEther('1.0'),
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
        BigInt(0),
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
      ).to.be.revertedWithCustomError(
        fuelMessagePortal,
        'ReentrancyGuardReentrantCall()'
      );
    });
  });
});
