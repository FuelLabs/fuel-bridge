import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { BigNumber, BigNumber as BN } from 'ethers';
import { Provider } from '@ethersproject/abstract-provider';
import { constructTree, calcRoot, getProof } from '@fuel-ts/merkle';
import { HarnessObject, setupFuel } from '../protocol/harness';
import BlockHeader, { computeBlockId } from '../protocol/blockHeader';
import { EMPTY } from '../protocol/constants';
import { compactSign } from '../protocol/validators';
import Message, { computeMessageId } from '../protocol/message';
import { randomAddress, randomBytes32 } from '../protocol/utils';

chai.use(solidity);
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

// Computes data for message
function computeMessageData(fuelTokenId: string, tokenId: string, from: string, to: string, amount: number): string {
    return ethers.utils.solidityPack(
        ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'uint256'],
        [fuelTokenId, tokenId, from, to, amount]
    );
}

// Create a simple block
function createBlock(blockIds: string[], messageIds: string[]): BlockHeader {
    const tai64Time = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add('4611686018427387914');
    const header: BlockHeader = {
        prevRoot: calcRoot(blockIds),
        height: blockIds.length.toString(),
        timestamp: tai64Time.toHexString(),
        daHeight: '0',
        txCount: '0',
        outputMessagesCount: messageIds.length.toString(),
        txRoot: EMPTY,
        outputMessagesRoot: calcRoot(messageIds),
    };

    return header;
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

describe('ERC20 Gateway', async () => {
    let env: HarnessObject;

    // Message data
    const fuelTokenTarget1 = randomBytes32();
    const fuelTokenTarget2 = randomBytes32();
    const messageIds: string[] = [];
    let gatewayAddress: string;
    let tokenAddress: string;

    // Messages
    let messageWithdrawal1: Message;
    let messageWithdrawal2: Message;
    let messageWithdrawal3: Message;
    let messageTooLarge: Message;
    let messageTooSmall: Message;
    let messageBadL2Token: Message;
    let messageBadL1Token: Message;
    let messageBadSender: Message;

    // Arrays of committed block headers and their IDs
    const blockHeaders: BlockHeader[] = [];
    const blockIds: string[] = [];
    const blockSignatures: string[] = [];

    before(async () => {
        env = await setupFuel();

        // get data for building messages
        gatewayAddress = env.fuelERC20Gateway.address.split('0x').join('0x000000000000000000000000').toLowerCase();
        tokenAddress = env.token.address;

        // message from trusted sender
        messageWithdrawal1 = new Message(
            fuelTokenTarget1,
            gatewayAddress,
            BN.from(0),
            randomBytes32(),
            env.fuelERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
                env.addresses[2],
                tokenAddress,
                100,
            ])
        );
        messageWithdrawal2 = new Message(
            fuelTokenTarget1,
            gatewayAddress,
            BN.from(0),
            randomBytes32(),
            env.fuelERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
                env.addresses[3],
                tokenAddress,
                75,
            ])
        );
        messageWithdrawal3 = new Message(
            fuelTokenTarget2,
            gatewayAddress,
            BN.from(0),
            randomBytes32(),
            env.fuelERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
                env.addresses[3],
                tokenAddress,
                250,
            ])
        );
        // message with amount too large
        messageTooLarge = new Message(
            fuelTokenTarget2,
            gatewayAddress,
            BN.from(0),
            randomBytes32(),
            env.fuelERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
                env.addresses[3],
                tokenAddress,
                1000,
            ])
        );
        // message with zero value
        messageTooSmall = new Message(
            fuelTokenTarget2,
            gatewayAddress,
            BN.from(0),
            randomBytes32(),
            env.fuelERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [env.addresses[3], tokenAddress, 0])
        );
        // message with bad L2 token
        messageBadL2Token = new Message(
            randomBytes32(),
            gatewayAddress,
            BN.from(0),
            randomBytes32(),
            env.fuelERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
                env.addresses[3],
                tokenAddress,
                10,
            ])
        );
        // message with bad L1 token
        messageBadL1Token = new Message(
            fuelTokenTarget2,
            gatewayAddress,
            BN.from(0),
            randomBytes32(),
            env.fuelERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
                env.addresses[3],
                randomAddress(),
                10,
            ])
        );
        // message from untrusted sender
        messageBadSender = new Message(
            randomBytes32(),
            gatewayAddress,
            BN.from(0),
            randomBytes32(),
            env.fuelERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
                env.addresses[3],
                tokenAddress,
                250,
            ])
        );

        // compile all message IDs
        messageIds.push(computeMessageId(messageWithdrawal1));
        messageIds.push(computeMessageId(messageWithdrawal2));
        messageIds.push(computeMessageId(messageWithdrawal3));
        messageIds.push(computeMessageId(messageTooLarge));
        messageIds.push(computeMessageId(messageTooSmall));
        messageIds.push(computeMessageId(messageBadL2Token));
        messageIds.push(computeMessageId(messageBadL1Token));
        messageIds.push(computeMessageId(messageBadSender));

        // create a block
        const blockHeader = createBlock(blockIds, messageIds);
        const blockId = computeBlockId(blockHeader);
        const blockSignature = await compactSign(env.poaSigner, blockId);

        // append block header and Id to arrays
        blockHeaders.push(blockHeader);
        blockIds.push(blockId);
        blockSignatures.push(blockSignature);

        // set token approval for gateway
        await env.token.approve(env.fuelERC20Gateway.address, env.initialTokenAmount);
    });

    describe('Verify access control', async () => {
        const defaultAdminRole = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const pauserRole = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('PAUSER_ROLE'));
        let signer0: string;
        let signer1: string;
        let signer2: string;
        before(async () => {
            signer0 = env.addresses[0];
            signer1 = env.addresses[1];
            signer2 = env.addresses[2];
        });

        it('Should be able to grant admin role', async () => {
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer1)).to.equal(false);

            // Grant admin role
            await expect(env.fuelERC20Gateway.grantRole(defaultAdminRole, signer1)).to.not.be.reverted;
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer1)).to.equal(true);
        });

        it('Should be able to renounce admin role', async () => {
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer0)).to.equal(true);

            // Revoke admin role
            await expect(env.fuelERC20Gateway.renounceRole(defaultAdminRole, signer0)).to.not.be.reverted;
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer0)).to.equal(false);
        });

        it('Should not be able to grant admin role as non-admin', async () => {
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer0)).to.equal(false);

            // Attempt grant admin role
            await expect(env.fuelERC20Gateway.grantRole(defaultAdminRole, signer0)).to.be.revertedWith(
                `AccessControl: account ${env.addresses[0].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer0)).to.equal(false);
        });

        it('Should be able to grant then revoke admin role', async () => {
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer0)).to.equal(false);
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer1)).to.equal(true);

            // Grant admin role
            await expect(env.fuelERC20Gateway.connect(env.signers[1]).grantRole(defaultAdminRole, signer0)).to.not.be
                .reverted;
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer0)).to.equal(true);

            // Revoke previous admin
            await expect(env.fuelERC20Gateway.revokeRole(defaultAdminRole, signer1)).to.not.be.reverted;
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer1)).to.equal(false);
        });

        it('Should be able to grant pauser role', async () => {
            expect(await env.fuelERC20Gateway.hasRole(pauserRole, signer1)).to.equal(false);

            // Grant pauser role
            await expect(env.fuelERC20Gateway.grantRole(pauserRole, signer1)).to.not.be.reverted;
            expect(await env.fuelERC20Gateway.hasRole(pauserRole, signer1)).to.equal(true);
        });

        it('Should not be able to grant permission as pauser', async () => {
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer2)).to.equal(false);
            expect(await env.fuelERC20Gateway.hasRole(pauserRole, signer2)).to.equal(false);

            // Attempt grant admin role
            await expect(
                env.fuelERC20Gateway.connect(env.signers[1]).grantRole(defaultAdminRole, signer2)
            ).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelERC20Gateway.hasRole(defaultAdminRole, signer2)).to.equal(false);

            // Attempt grant pauser role
            await expect(
                env.fuelERC20Gateway.connect(env.signers[1]).grantRole(pauserRole, signer2)
            ).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelERC20Gateway.hasRole(pauserRole, signer2)).to.equal(false);
        });

        it('Should be able to revoke pauser role', async () => {
            expect(await env.fuelERC20Gateway.hasRole(pauserRole, signer1)).to.equal(true);

            // Grant pauser role
            await expect(env.fuelERC20Gateway.revokeRole(pauserRole, signer1)).to.not.be.reverted;
            expect(await env.fuelERC20Gateway.hasRole(pauserRole, signer1)).to.equal(false);
        });
    });

    describe('Make both valid and invalid ERC20 deposits', async () => {
        let provider: Provider;
        before(async () => {
            provider = env.fuelMessagePortal.provider;
        });

        it('Should not be able to deposit zero', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);
            expect(await env.fuelERC20Gateway.tokensDeposited(tokenAddress, fuelTokenTarget1)).to.be.equal(
                gatewayBalance
            );

            // Attempt deposit
            await expect(
                env.fuelERC20Gateway.deposit(randomBytes32(), tokenAddress, fuelTokenTarget1, 0)
            ).to.be.revertedWith('Cannot deposit zero');
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance);
        });

        it('Should not be able to deposit with zero balance', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);
            expect(await env.fuelERC20Gateway.tokensDeposited(tokenAddress, fuelTokenTarget1)).to.be.equal(
                gatewayBalance
            );

            // Attempt deposit
            await expect(
                env.fuelERC20Gateway
                    .connect(env.signers[1])
                    .deposit(randomBytes32(), tokenAddress, fuelTokenTarget1, 175)
            ).to.be.revertedWith('ERC20: insufficient allowance');
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance);
        });

        it('Should be able to deposit tokens', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);
            expect(await env.fuelERC20Gateway.tokensDeposited(tokenAddress, fuelTokenTarget1)).to.be.equal(
                gatewayBalance
            );

            // Deposit 175 to fuelTokenTarget1
            await expect(env.fuelERC20Gateway.deposit(randomBytes32(), tokenAddress, fuelTokenTarget1, 175)).to.not.be
                .reverted;
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance.add(175));

            // Deposit 250 to fuelTokenTarget2
            const toAddress = randomBytes32();
            await expect(env.fuelERC20Gateway.deposit(toAddress, tokenAddress, fuelTokenTarget2, 250)).to.not.be
                .reverted;
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(
                gatewayBalance.add(175).add(250)
            );

            // Verify SentMessage event to l2contract
            const messageData = computeMessageData(
                fuelTokenTarget2,
                tokenAddress.split('0x').join('0x000000000000000000000000'),
                env.addresses[0].split('0x').join('0x000000000000000000000000'),
                toAddress,
                250
            );
            const filter2 = {
                address: env.fuelMessagePortal.address,
            };
            const logs2 = await provider.getLogs(filter2);
            const sentMessageEvent = env.fuelMessagePortal.interface.parseLog(logs2[logs2.length - 1]);
            expect(sentMessageEvent.name).to.equal('SentMessage');
            expect(sentMessageEvent.args.sender).to.equal(gatewayAddress);
            expect(sentMessageEvent.args.data).to.equal(messageData);
            expect(sentMessageEvent.args.amount).to.equal(0);
        });
    });

    describe('Make both valid and invalid ERC20 withdrawals', async () => {
        let messageNodes: TreeNode[];
        let blockHeader: BlockHeader;
        let poaSignature: string;
        before(async () => {
            messageNodes = constructTree(messageIds);
            blockHeader = blockHeaders[0];
            poaSignature = blockSignatures[0];
        });

        it('Should not be able to directly call finalize', async () => {
            await expect(
                env.fuelERC20Gateway.finalizeWithdrawal(env.addresses[2], tokenAddress, BN.from(100))
            ).to.be.revertedWith('Caller is not the portal');
        });

        it('Should be able to finalize valid withdrawal through portal', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);
            const recipientBalance = await env.token.balanceOf(env.addresses[2]);
            const messageID = computeMessageId(messageWithdrawal1);
            const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
            const messageInBlockProof = {
                key: leafIndexKey,
                proof: getProof(messageNodes, leafIndexKey),
            };
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            await expect(
                env.fuelMessagePortal.relayMessageFromFuelBlock(
                    messageWithdrawal1,
                    blockHeader,
                    messageInBlockProof,
                    poaSignature
                )
            ).to.not.be.reverted;
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(true);
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance.sub(100));
            expect(await env.token.balanceOf(env.addresses[2])).to.be.equal(recipientBalance.add(100));
        });

        it('Should be able to finalize valid withdrawal through portal again', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);
            const recipientBalance = await env.token.balanceOf(env.addresses[3]);
            const messageID = computeMessageId(messageWithdrawal2);
            const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
            const messageInBlockProof = {
                key: leafIndexKey,
                proof: getProof(messageNodes, leafIndexKey),
            };
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            await expect(
                env.fuelMessagePortal.relayMessageFromFuelBlock(
                    messageWithdrawal2,
                    blockHeader,
                    messageInBlockProof,
                    poaSignature
                )
            ).to.not.be.reverted;
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(true);
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance.sub(75));
            expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance.add(75));
        });

        it('Should not be able to finalize withdrawal with more than deposited', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);
            const recipientBalance = await env.token.balanceOf(env.addresses[3]);
            const messageID = computeMessageId(messageTooLarge);
            const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
            const messageInBlockProof = {
                key: leafIndexKey,
                proof: getProof(messageNodes, leafIndexKey),
            };
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            await expect(
                env.fuelMessagePortal.relayMessageFromFuelBlock(
                    messageTooLarge,
                    blockHeader,
                    messageInBlockProof,
                    poaSignature
                )
            ).to.be.revertedWith('Message relay failed');
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance);
            expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance);
        });

        it('Should not be able to finalize withdrawal of zero tokens', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);
            const recipientBalance = await env.token.balanceOf(env.addresses[3]);
            const messageID = computeMessageId(messageTooSmall);
            const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
            const messageInBlockProof = {
                key: leafIndexKey,
                proof: getProof(messageNodes, leafIndexKey),
            };
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            await expect(
                env.fuelMessagePortal.relayMessageFromFuelBlock(
                    messageTooSmall,
                    blockHeader,
                    messageInBlockProof,
                    poaSignature
                )
            ).to.be.revertedWith('Message relay failed');
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance);
            expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance);
        });

        it('Should not be able to finalize withdrawal with bad L2 token', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);
            const recipientBalance = await env.token.balanceOf(env.addresses[3]);
            const messageID = computeMessageId(messageBadL2Token);
            const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
            const messageInBlockProof = {
                key: leafIndexKey,
                proof: getProof(messageNodes, leafIndexKey),
            };
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            await expect(
                env.fuelMessagePortal.relayMessageFromFuelBlock(
                    messageBadL2Token,
                    blockHeader,
                    messageInBlockProof,
                    poaSignature
                )
            ).to.be.revertedWith('Message relay failed');
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance);
            expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance);
        });

        it('Should not be able to finalize withdrawal with bad L1 token', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);
            const recipientBalance = await env.token.balanceOf(env.addresses[3]);
            const messageID = computeMessageId(messageBadL1Token);
            const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
            const messageInBlockProof = {
                key: leafIndexKey,
                proof: getProof(messageNodes, leafIndexKey),
            };
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            await expect(
                env.fuelMessagePortal.relayMessageFromFuelBlock(
                    messageBadL1Token,
                    blockHeader,
                    messageInBlockProof,
                    poaSignature
                )
            ).to.be.revertedWith('Message relay failed');
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance);
            expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance);
        });

        it('Should not be able to finalize withdrawal with bad sender', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);
            const recipientBalance = await env.token.balanceOf(env.addresses[3]);
            const messageID = computeMessageId(messageBadSender);
            const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
            const messageInBlockProof = {
                key: leafIndexKey,
                proof: getProof(messageNodes, leafIndexKey),
            };
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            await expect(
                env.fuelMessagePortal.relayMessageFromFuelBlock(
                    messageBadSender,
                    blockHeader,
                    messageInBlockProof,
                    poaSignature
                )
            ).to.be.revertedWith('Message relay failed');
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance);
            expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance);
        });
    });

    describe('Verify pause and unpause', async () => {
        const defaultAdminRole = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const pauserRole = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('PAUSER_ROLE'));
        let messageNodes: TreeNode[];
        let blockHeader: BlockHeader;
        let poaSignature: string;
        before(async () => {
            messageNodes = constructTree(messageIds);
            blockHeader = blockHeaders[0];
            poaSignature = blockSignatures[0];
        });

        it('Should be able to grant pauser role', async () => {
            expect(await env.fuelERC20Gateway.hasRole(pauserRole, env.addresses[2])).to.equal(false);

            // Grant pauser role
            await expect(env.fuelERC20Gateway.grantRole(pauserRole, env.addresses[2])).to.not.be.reverted;
            expect(await env.fuelERC20Gateway.hasRole(pauserRole, env.addresses[2])).to.equal(true);
        });

        it('Should not be able to pause as non-pauser', async () => {
            expect(await env.fuelERC20Gateway.paused()).to.be.equal(false);

            // Attempt pause
            await expect(env.fuelERC20Gateway.connect(env.signers[1]).pause()).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${pauserRole}`
            );
            expect(await env.fuelERC20Gateway.paused()).to.be.equal(false);
        });

        it('Should be able to pause as pauser', async () => {
            expect(await env.fuelERC20Gateway.paused()).to.be.equal(false);

            // Pause
            await expect(env.fuelERC20Gateway.connect(env.signers[2]).pause()).to.not.be.reverted;
            expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);
        });

        it('Should not be able to unpause as pauser (and not admin)', async () => {
            expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);

            // Attempt unpause
            await expect(env.fuelERC20Gateway.connect(env.signers[2]).unpause()).to.be.revertedWith(
                `AccessControl: account ${env.addresses[2].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);
        });

        it('Should not be able to unpause as non-admin', async () => {
            expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);

            // Attempt unpause
            await expect(env.fuelERC20Gateway.connect(env.signers[1]).unpause()).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);
        });

        it('Should not be able to finalize withdrawal when paused', async () => {
            const messageID = computeMessageId(messageWithdrawal3);
            const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
            const messageInBlockProof = {
                key: leafIndexKey,
                proof: getProof(messageNodes, leafIndexKey),
            };
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            await expect(
                env.fuelMessagePortal.relayMessageFromFuelBlock(
                    messageWithdrawal3,
                    blockHeader,
                    messageInBlockProof,
                    poaSignature
                )
            ).to.be.revertedWith('Message relay failed');
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
        });

        it('Should not be able to deposit when paused', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);

            // Deposit 175 to fuelTokenTarget1
            await expect(
                env.fuelERC20Gateway.deposit(randomBytes32(), tokenAddress, fuelTokenTarget1, 175)
            ).to.be.revertedWith('Pausable: paused');
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance);
        });

        it('Should be able to unpause as admin', async () => {
            expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);

            // Unpause
            await expect(env.fuelERC20Gateway.unpause()).to.not.be.reverted;
            expect(await env.fuelERC20Gateway.paused()).to.be.equal(false);
        });

        it('Should be able to finalize withdrawal when unpaused', async () => {
            const gatewayBalance = await env.token.balanceOf(env.fuelERC20Gateway.address);
            const recipientBalance = await env.token.balanceOf(env.addresses[3]);
            const messageID = computeMessageId(messageWithdrawal3);
            const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
            const messageInBlockProof = {
                key: leafIndexKey,
                proof: getProof(messageNodes, leafIndexKey),
            };
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(false);
            await expect(
                env.fuelMessagePortal.relayMessageFromFuelBlock(
                    messageWithdrawal3,
                    blockHeader,
                    messageInBlockProof,
                    poaSignature
                )
            ).to.not.be.reverted;
            expect(await env.fuelMessagePortal.incomingMessageSuccessful(messageID)).to.be.equal(true);
            expect(await env.token.balanceOf(env.fuelERC20Gateway.address)).to.be.equal(gatewayBalance.sub(250));
            expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance.add(250));
        });

        it('Should be able to revoke pauser role', async () => {
            expect(await env.fuelERC20Gateway.hasRole(pauserRole, env.addresses[2])).to.equal(true);

            // Grant pauser role
            await expect(env.fuelERC20Gateway.revokeRole(pauserRole, env.addresses[2])).to.not.be.reverted;
            expect(await env.fuelERC20Gateway.hasRole(pauserRole, env.addresses[2])).to.equal(false);
        });
    });
});
