import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { BigNumber, BigNumber as BN } from 'ethers';
import { Provider } from '@ethersproject/abstract-provider';
import { HarnessObject, setupFuel } from '../protocol/harness';
import BlockHeader, { computeBlockId } from '../protocol/sidechainBlock';
import { EMPTY } from '../protocol/constants';
import { constructTree, calcRoot, getProof } from '../protocol/binaryMerkleTree/binaryMerkleTree';
import Node from '../protocol/binaryMerkleTree/types/node';
import { compactSign } from '../protocol/validators';
import MessageOutput from '../protocol/messageOutput';
import hash from '../protocol/cryptography';
import { randomAddress, randomBytes32 } from '../protocol/utils';

chai.use(solidity);
const { expect } = chai;

function computeMessageId(message: MessageOutput): string {
	return hash(
		ethers.utils.solidityPack(
			['bytes32', 'bytes32', 'bytes32', 'uint64', 'bytes'],
			[message.sender, message.recipient, message.nonce, message.amount, message.data]
		)
	);
}
function computeMessageData(
	fuelTokenId: string,
	tokenId: string,
	from: string,
	to: string,
	amount: number
): string {
	return ethers.utils.solidityPack(
		['bytes32', 'bytes32', 'bytes32', 'bytes32', 'uint256'],
		[fuelTokenId, tokenId, from, to, amount]
	);
}

// Create a simple block
function createBlock(blockIds: string[], messageIds: string[]): BlockHeader {
	const tai64Time = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
		'4611686018427387914'
	);
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

// get proof for the leaf
function getLeafIndexKey(nodes: Node[], data: string): number {
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
	let l1GatewayAddress: string;
	let tokenAddress: string;

	// Messages
	let messageWithdrawal1: MessageOutput;
	let messageWithdrawal2: MessageOutput;
	let messageWithdrawal3: MessageOutput;
	let messageTooLarge: MessageOutput;
	let messageTooSmall: MessageOutput;
	let messageBadL2Token: MessageOutput;
	let messageBadL1Token: MessageOutput;
	let messageBadSender: MessageOutput;

	// Arrays of committed block headers and their IDs
	const blockHeaders: BlockHeader[] = [];
	const blockIds: string[] = [];
	const blockSignatures: string[] = [];

	before(async () => {
		env = await setupFuel();

		// get data for building messages
		l1GatewayAddress = env.l1ERC20Gateway.address
			.split('0x')
			.join('0x000000000000000000000000')
			.toLowerCase();
		tokenAddress = env.token.address;

		// message from trusted sender
		messageWithdrawal1 = new MessageOutput(
			fuelTokenTarget1,
			l1GatewayAddress,
			BN.from(0),
			randomBytes32(),
			env.l1ERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
				env.addresses[2],
				tokenAddress,
				100,
			])
		);
		messageWithdrawal2 = new MessageOutput(
			fuelTokenTarget1,
			l1GatewayAddress,
			BN.from(0),
			randomBytes32(),
			env.l1ERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
				env.addresses[3],
				tokenAddress,
				75,
			])
		);
		messageWithdrawal3 = new MessageOutput(
			fuelTokenTarget2,
			l1GatewayAddress,
			BN.from(0),
			randomBytes32(),
			env.l1ERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
				env.addresses[3],
				tokenAddress,
				250,
			])
		);
		// message with amount too large
		messageTooLarge = new MessageOutput(
			fuelTokenTarget2,
			l1GatewayAddress,
			BN.from(0),
			randomBytes32(),
			env.l1ERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
				env.addresses[3],
				tokenAddress,
				1000,
			])
		);
		// message with zero value
		messageTooSmall = new MessageOutput(
			fuelTokenTarget2,
			l1GatewayAddress,
			BN.from(0),
			randomBytes32(),
			env.l1ERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
				env.addresses[3],
				tokenAddress,
				0,
			])
		);
		// message with bad L2 token
		messageBadL2Token = new MessageOutput(
			randomBytes32(),
			l1GatewayAddress,
			BN.from(0),
			randomBytes32(),
			env.l1ERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
				env.addresses[3],
				tokenAddress,
				10,
			])
		);
		// message with bad L1 token
		messageBadL1Token = new MessageOutput(
			fuelTokenTarget2,
			l1GatewayAddress,
			BN.from(0),
			randomBytes32(),
			env.l1ERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
				env.addresses[3],
				randomAddress(),
				10,
			])
		);
		// message from untrusted sender
		messageBadSender = new MessageOutput(
			randomBytes32(),
			l1GatewayAddress,
			BN.from(0),
			randomBytes32(),
			env.l1ERC20Gateway.interface.encodeFunctionData('finalizeWithdrawal', [
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
		await env.token.approve(env.l1ERC20Gateway.address, env.initialTokenAmount);
	});

	describe('Verify ownership', async () => {
		let signer0: string;
		let signer1: string;
		before(async () => {
			signer0 = env.addresses[0];
			signer1 = env.addresses[1];
		});

		it('Should be able to switch owner as owner', async () => {
			expect(await env.l1ERC20Gateway.owner()).to.not.be.equal(signer1);

			// Transfer ownership
			await expect(env.l1ERC20Gateway.transferOwnership(signer1)).to.not.be.reverted;
			expect(await env.l1ERC20Gateway.owner()).to.be.equal(signer1);
		});

		it('Should not be able to switch owner as non-owner', async () => {
			expect(await env.l1ERC20Gateway.owner()).to.be.equal(signer1);

			// Attempt transfer ownership
			await expect(env.l1ERC20Gateway.transferOwnership(signer0)).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);
			expect(await env.l1ERC20Gateway.owner()).to.be.equal(signer1);
		});

		it('Should be able to switch owner back', async () => {
			expect(await env.l1ERC20Gateway.owner()).to.not.be.equal(signer0);

			// Transfer ownership
			await expect(env.l1ERC20Gateway.connect(env.signers[1]).transferOwnership(signer0)).to
				.not.be.reverted;
			expect(await env.l1ERC20Gateway.owner()).to.be.equal(signer0);
		});
	});

	describe('Make both valid and invalid ERC20 deposits', async () => {
		let provider: Provider;
		before(async () => {
			provider = env.fuelMessagePortal.provider;
		});

		it('Should not be able to deposit zero', async () => {
			const gatewayBalance = await env.token.balanceOf(env.l1ERC20Gateway.address);

			// Attempt deposit
			await expect(
				env.l1ERC20Gateway.deposit(randomBytes32(), tokenAddress, fuelTokenTarget1, 0)
			).to.be.revertedWith('Cannot deposit zero');
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
				gatewayBalance
			);
		});

		it('Should not be able to deposit with zero balance', async () => {
			const gatewayBalance = await env.token.balanceOf(env.l1ERC20Gateway.address);

			// Attempt deposit
			await expect(
				env.l1ERC20Gateway
					.connect(env.signers[1])
					.deposit(randomBytes32(), tokenAddress, fuelTokenTarget1, 175)
			).to.be.revertedWith('ERC20: insufficient allowance');
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
				gatewayBalance
			);
		});

		it('Should be able to deposit tokens', async () => {
			const gatewayBalance = await env.token.balanceOf(env.l1ERC20Gateway.address);

			// Deposit 175 to fuelTokenTarget1
			await expect(
				env.l1ERC20Gateway.deposit(randomBytes32(), tokenAddress, fuelTokenTarget1, 175)
			).to.not.be.reverted;
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
				gatewayBalance.add(175)
			);

			// Deposit 250 to fuelTokenTarget2
			const toAddress = randomBytes32();
			await expect(env.l1ERC20Gateway.deposit(toAddress, tokenAddress, fuelTokenTarget2, 250))
				.to.not.be.reverted;
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
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
			const sentMessageEvent = env.fuelMessagePortal.interface.parseLog(
				logs2[logs2.length - 1]
			);
			expect(sentMessageEvent.name).to.equal('SentMessage');
			expect(sentMessageEvent.args.sender).to.equal(l1GatewayAddress);
			expect(sentMessageEvent.args.data).to.equal(messageData);
			expect(sentMessageEvent.args.amount).to.equal(0);
		});
	});

	describe('Make both valid and invalid ERC20 withdrawals', async () => {
		let messageNodes: Node[];
		let blockHeader: BlockHeader;
		let poaSignature: string;
		before(async () => {
			messageNodes = constructTree(messageIds);
			blockHeader = blockHeaders[0];
			poaSignature = blockSignatures[0];
		});

		it('Should not be able to directly call finalize', async () => {
			await expect(
				env.l1ERC20Gateway.finalizeWithdrawal(env.addresses[2], tokenAddress, BN.from(100))
			).to.be.revertedWith('Caller is not the portal');
		});

		it('Should be able to finalize valid withdrawal through portal', async () => {
			const gatewayBalance = await env.token.balanceOf(env.l1ERC20Gateway.address);
			const recipientBalance = await env.token.balanceOf(env.addresses[2]);
			const messageID = computeMessageId(messageWithdrawal1);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromFuelBlock(
					messageWithdrawal1,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.not.be.reverted;
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				true
			);
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
				gatewayBalance.sub(100)
			);
			expect(await env.token.balanceOf(env.addresses[2])).to.be.equal(
				recipientBalance.add(100)
			);
		});

		it('Should be able to finalize valid withdrawal through portal again', async () => {
			const gatewayBalance = await env.token.balanceOf(env.l1ERC20Gateway.address);
			const recipientBalance = await env.token.balanceOf(env.addresses[3]);
			const messageID = computeMessageId(messageWithdrawal2);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromFuelBlock(
					messageWithdrawal2,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.not.be.reverted;
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				true
			);
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
				gatewayBalance.sub(75)
			);
			expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(
				recipientBalance.add(75)
			);
		});

		it('Should not be able to finalize withdrawal with more than deposited', async () => {
			const gatewayBalance = await env.token.balanceOf(env.l1ERC20Gateway.address);
			const recipientBalance = await env.token.balanceOf(env.addresses[3]);
			const messageID = computeMessageId(messageTooLarge);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromFuelBlock(
					messageTooLarge,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.be.revertedWith('Message relay failed');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
				gatewayBalance
			);
			expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance);
		});

		it('Should not be able to finalize withdrawal of zero tokens', async () => {
			const gatewayBalance = await env.token.balanceOf(env.l1ERC20Gateway.address);
			const recipientBalance = await env.token.balanceOf(env.addresses[3]);
			const messageID = computeMessageId(messageTooSmall);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromFuelBlock(
					messageTooSmall,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.be.revertedWith('Message relay failed');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
				gatewayBalance
			);
			expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance);
		});

		it('Should not be able to finalize withdrawal with bad L2 token', async () => {
			const gatewayBalance = await env.token.balanceOf(env.l1ERC20Gateway.address);
			const recipientBalance = await env.token.balanceOf(env.addresses[3]);
			const messageID = computeMessageId(messageBadL2Token);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromFuelBlock(
					messageBadL2Token,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.be.revertedWith('Message relay failed');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
				gatewayBalance
			);
			expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance);
		});

		it('Should not be able to finalize withdrawal with bad L1 token', async () => {
			const gatewayBalance = await env.token.balanceOf(env.l1ERC20Gateway.address);
			const recipientBalance = await env.token.balanceOf(env.addresses[3]);
			const messageID = computeMessageId(messageBadL1Token);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromFuelBlock(
					messageBadL1Token,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.be.revertedWith('Message relay failed');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
				gatewayBalance
			);
			expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance);
		});

		it('Should not be able to finalize withdrawal with bad sender', async () => {
			const gatewayBalance = await env.token.balanceOf(env.l1ERC20Gateway.address);
			const recipientBalance = await env.token.balanceOf(env.addresses[3]);
			const messageID = computeMessageId(messageBadSender);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromFuelBlock(
					messageBadSender,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.be.revertedWith('Message relay failed');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
				gatewayBalance
			);
			expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(recipientBalance);
		});
	});

	describe('Verify pause and unpause', async () => {
		let messageNodes: Node[];
		let blockHeader: BlockHeader;
		let poaSignature: string;
		before(async () => {
			messageNodes = constructTree(messageIds);
			blockHeader = blockHeaders[0];
			poaSignature = blockSignatures[0];
		});

		it('Should not be able to pause as non-owner', async () => {
			expect(await env.l1ERC20Gateway.paused()).to.be.equal(false);

			// Attempt pause
			await expect(env.l1ERC20Gateway.connect(env.signers[1]).pause()).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);
			expect(await env.l1ERC20Gateway.paused()).to.be.equal(false);
		});

		it('Should be able to pause as owner', async () => {
			expect(await env.l1ERC20Gateway.paused()).to.be.equal(false);

			// Pause
			await expect(env.l1ERC20Gateway.pause()).to.not.be.reverted;
			expect(await env.l1ERC20Gateway.paused()).to.be.equal(true);
		});

		it('Should not be able to unpause as non-owner', async () => {
			expect(await env.l1ERC20Gateway.paused()).to.be.equal(true);

			// Attempt unpause
			await expect(env.l1ERC20Gateway.connect(env.signers[1]).unpause()).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);
			expect(await env.l1ERC20Gateway.paused()).to.be.equal(true);
		});

		it('Should not be able to finalize withdrawal when paused', async () => {
			const messageID = computeMessageId(messageWithdrawal3);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromFuelBlock(
					messageWithdrawal3,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.be.revertedWith('Message relay failed');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
		});

		it('Should be able to unpause as owner', async () => {
			expect(await env.l1ERC20Gateway.paused()).to.be.equal(true);

			// Unpause
			await expect(env.l1ERC20Gateway.unpause()).to.not.be.reverted;
			expect(await env.l1ERC20Gateway.paused()).to.be.equal(false);
		});

		it('Should be able to finalize withdrawal when unpaused', async () => {
			const gatewayBalance = await env.token.balanceOf(env.l1ERC20Gateway.address);
			const recipientBalance = await env.token.balanceOf(env.addresses[3]);
			const messageID = computeMessageId(messageWithdrawal3);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromFuelBlock(
					messageWithdrawal3,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.not.be.reverted;
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				true
			);
			expect(await env.token.balanceOf(env.l1ERC20Gateway.address)).to.be.equal(
				gatewayBalance.sub(250)
			);
			expect(await env.token.balanceOf(env.addresses[3])).to.be.equal(
				recipientBalance.add(250)
			);
		});
	});
});
