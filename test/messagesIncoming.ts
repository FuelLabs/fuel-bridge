import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { BigNumber as BN } from 'ethers';
import { Provider } from '@ethersproject/abstract-provider';
import { MessageReceivingContract } from '../typechain/MessageReceivingContract.d';
import { HarnessObject, setupFuel } from '../protocol/harness';
import BlockHeader, {
	BlockHeaderLite,
	computeBlockId,
	generateBlockHeaderLite,
} from '../protocol/sidechainBlock';
import { EMPTY } from '../protocol/constants';
import { constructTree, calcRoot, getProof } from '../protocol/binaryMerkleTree/binaryMerkleTree';
import Node from '../protocol/binaryMerkleTree/types/node';
import { compactSign } from '../protocol/validators';
import MessageOutput from '../protocol/messageOutput';
import hash from '../protocol/cryptography';
import { randomBytes32 } from '../protocol/utils';

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

// Create a simple block
function createBlock(blockIds: string[], messageIds: string[]): BlockHeader {
	const tai64Time = BN.from(Math.floor(new Date().getTime() / 1000)).add('4611686018427387914');
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

describe('Incoming Messages', async () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let hre: any;
	let env: HarnessObject;
	let fuelBaseAssetDecimals: number;
	let baseAssetConversion: number;
	let onlyEnoughGasForProving: number;

	// Message data
	const messageTestData1 = randomBytes32();
	const messageTestData2 = randomBytes32();
	const messageTestData3 = randomBytes32();
	const messageIds: string[] = [];
	let trustedSenderAddress: string;

	// Testing contracts
	let messageReceivingContract: MessageReceivingContract;
	let messageReceivingContractAddress: string;

	// Messages
	let message1: MessageOutput;
	let message2: MessageOutput;
	let messageWithAmount: MessageOutput;
	let messageBadSender: MessageOutput;
	let messageBadRecipient: MessageOutput;
	let messageBadData: MessageOutput;
	let messageEOA: MessageOutput;
	let messageEOANoAmount: MessageOutput;

	// Arrays of committed block headers and their IDs
	const blockHeaders: BlockHeader[] = [];
	const blockIds: string[] = [];
	const blockSignatures: string[] = [];

	before(async () => {
		hre = require('hardhat');
		env = await setupFuel();
		fuelBaseAssetDecimals = await env.fuelMessagePortal.getFuelBaseAssetDecimals();
		baseAssetConversion = 10 ** (18 - fuelBaseAssetDecimals);
		onlyEnoughGasForProving = hre.network.name === 'coverage' ? 160000 : 140000;

		// Deploy contracts for message testing.
		const msgRecContractFactory = await ethers.getContractFactory('MessageReceivingContract');
		messageReceivingContract = (await msgRecContractFactory.deploy(
			env.fuelMessagePortal.address
		)) as MessageReceivingContract;
		await messageReceivingContract.deployed();
		expect(await messageReceivingContract.data1()).to.be.equal(0);
		expect(await messageReceivingContract.data2()).to.be.equal(0);

		// get data for building messages
		messageReceivingContractAddress = messageReceivingContract.address
			.split('0x')
			.join('0x000000000000000000000000');
		trustedSenderAddress = await messageReceivingContract.getTrustedSender();

		// message from trusted sender
		message1 = new MessageOutput(
			trustedSenderAddress,
			messageReceivingContractAddress,
			BN.from(0),
			randomBytes32(),
			messageReceivingContract.interface.encodeFunctionData('receiveMessage', [
				messageTestData1,
				messageTestData2,
			])
		);
		message2 = new MessageOutput(
			trustedSenderAddress,
			messageReceivingContractAddress,
			BN.from(0),
			randomBytes32(),
			messageReceivingContract.interface.encodeFunctionData('receiveMessage', [
				messageTestData2,
				messageTestData1,
			])
		);
		// message from trusted sender with amount
		messageWithAmount = new MessageOutput(
			trustedSenderAddress,
			messageReceivingContractAddress,
			ethers.utils.parseEther('0.1').div(baseAssetConversion),
			randomBytes32(),
			messageReceivingContract.interface.encodeFunctionData('receiveMessage', [
				messageTestData2,
				messageTestData3,
			])
		);
		// message from untrusted sender
		messageBadSender = new MessageOutput(
			randomBytes32(),
			messageReceivingContractAddress,
			BN.from(0),
			randomBytes32(),
			messageReceivingContract.interface.encodeFunctionData('receiveMessage', [
				messageTestData3,
				messageTestData1,
			])
		);
		// message to bad recipient
		messageBadRecipient = new MessageOutput(
			trustedSenderAddress,
			env.fuelMessagePortal.address.split('0x').join('0x000000000000000000000000'),
			BN.from(0),
			randomBytes32(),
			messageReceivingContract.interface.encodeFunctionData('receiveMessage', [
				messageTestData2,
				messageTestData2,
			])
		);
		// message with bad data
		messageBadData = new MessageOutput(
			trustedSenderAddress,
			messageReceivingContractAddress,
			BN.from(0),
			randomBytes32(),
			randomBytes32()
		);
		// message to EOA
		messageEOA = new MessageOutput(
			randomBytes32(),
			env.addresses[2].split('0x').join('0x000000000000000000000000'),
			ethers.utils.parseEther('0.1').div(baseAssetConversion),
			randomBytes32(),
			'0x'
		);
		// message to EOA no amount
		messageEOANoAmount = new MessageOutput(
			randomBytes32(),
			env.addresses[3].split('0x').join('0x000000000000000000000000'),
			BN.from(0),
			randomBytes32(),
			'0x'
		);

		// compile all message IDs
		messageIds.push(computeMessageId(message1));
		messageIds.push(computeMessageId(message2));
		messageIds.push(computeMessageId(messageWithAmount));
		messageIds.push(computeMessageId(messageBadSender));
		messageIds.push(computeMessageId(messageBadRecipient));
		messageIds.push(computeMessageId(messageBadData));
		messageIds.push(computeMessageId(messageEOA));
		messageIds.push(computeMessageId(messageEOANoAmount));

		// create blocks
		for (let i = 0; i < 500; i++) {
			const blockHeader = createBlock(blockIds, messageIds);
			const blockId = computeBlockId(blockHeader);
			const blockSignature = await compactSign(env.poaSigner, blockId);

			// append block header and Id to arrays
			blockHeaders.push(blockHeader);
			blockIds.push(blockId);
			blockSignatures.push(blockSignature);
		}

		// make sure the portal has eth to relay
		await env.signers[0].sendTransaction({
			to: env.fuelMessagePortal.address,
			value: ethers.utils.parseEther('0.2'),
		});
	});

	describe('Verify ownership', async () => {
		let signer0: string;
		let signer1: string;
		before(async () => {
			signer0 = env.addresses[0];
			signer1 = env.addresses[1];
		});

		it('Should be able to switch owner as owner', async () => {
			expect(await env.fuelMessagePortal.owner()).to.not.be.equal(signer1);

			// Transfer ownership
			await expect(env.fuelMessagePortal.transferOwnership(signer1)).to.not.be.reverted;
			expect(await env.fuelMessagePortal.owner()).to.be.equal(signer1);
		});

		it('Should not be able to switch owner as non-owner', async () => {
			expect(await env.fuelMessagePortal.owner()).to.be.equal(signer1);

			// Attempt transfer ownership
			await expect(env.fuelMessagePortal.transferOwnership(signer0)).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);
			expect(await env.fuelMessagePortal.owner()).to.be.equal(signer1);
		});

		it('Should be able to switch owner back', async () => {
			expect(await env.fuelMessagePortal.owner()).to.not.be.equal(signer0);

			// Transfer ownership
			await expect(env.fuelMessagePortal.connect(env.signers[1]).transferOwnership(signer0))
				.to.not.be.reverted;
			expect(await env.fuelMessagePortal.owner()).to.be.equal(signer0);
		});
	});

	describe('Verify owner functions', async () => {
		let messageNodes: Node[];
		let blockHeader: BlockHeader;
		let poaSignature: string;
		before(async () => {
			messageNodes = constructTree(messageIds);
			blockHeader = blockHeaders[0];
			poaSignature = blockSignatures[0];
		});

		it('Should not be able to set timelock as non-owner', async () => {
			expect(await env.fuelMessagePortal.s_incomingMessageTimelock()).to.be.equal(BN.from(0));

			// Attempt set timelock
			await expect(
				env.fuelMessagePortal.connect(env.signers[1]).setIncomingMessageTimelock(10)
			).to.be.revertedWith('Ownable: caller is not the owner');
			expect(await env.fuelMessagePortal.s_incomingMessageTimelock()).to.be.equal(BN.from(0));
		});

		it('Should be able to set the timelock as owner', async () => {
			const newTimelockValue = 7 * 24 * 60 * 60 * 1000;
			expect(await env.fuelMessagePortal.s_incomingMessageTimelock()).to.not.be.equal(
				BN.from(newTimelockValue)
			);

			// Set timelock
			await expect(env.fuelMessagePortal.setIncomingMessageTimelock(newTimelockValue)).to.not
				.be.reverted;
			expect(await env.fuelMessagePortal.s_incomingMessageTimelock()).to.be.equal(
				BN.from(newTimelockValue)
			);
		});

		it('Should not be able to relay valid message before timelock', async () => {
			const messageID = computeMessageId(message1);
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
					message1,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.be.revertedWith('Timelock not elapsed');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);

			// Remove timelock
			await expect(env.fuelMessagePortal.setIncomingMessageTimelock(0)).to.not.be.reverted;
			expect(await env.fuelMessagePortal.s_incomingMessageTimelock()).to.be.equal(BN.from(0));
		});

		it('Should not get a valid message sender outside of relaying', async () => {
			await expect(env.fuelMessagePortal.getMessageSender()).to.be.revertedWith(
				'Current message sender not set'
			);
		});
	});

	describe('Relay both valid and invalid messages', async () => {
		let provider: Provider;
		let prevBlockNodes: Node[];
		let messageNodes: Node[];
		let blockHeader: BlockHeader;
		let poaSignature: string;
		let prevRootHeader: BlockHeaderLite;
		let prevRootPoaSignature: string;
		before(async () => {
			provider = env.fuelMessagePortal.provider;
			messageNodes = constructTree(messageIds);
			blockHeader = blockHeaders[0];
			poaSignature = blockSignatures[0];

			const prevBlockNodesRootBlockNum = blockIds.length - 1;
			prevRootHeader = generateBlockHeaderLite(blockHeaders[prevBlockNodesRootBlockNum]);
			prevRootPoaSignature = blockSignatures[prevBlockNodesRootBlockNum];
			const prevBlockIds = [];
			for (let i = 0; i < blockIds.length - 1; i++) prevBlockIds.push(blockIds[i]);
			prevBlockNodes = constructTree(prevBlockIds);
		});

		it('Should not be able to call messageable contract directly', async () => {
			await expect(
				messageReceivingContract.receiveMessage(messageTestData3, messageTestData3)
			).to.be.revertedWith('Caller is not the portal');
		});

		it('Should not be able to relay message with bad block', async () => {
			const messageID = computeMessageId(message1);
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
					message1,
					blockHeader,
					messageInBlockProof,
					randomBytes32()
				)
			).to.be.revertedWith('signature-invalid-length');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
		});

		it('Should not be able to relay message with bad root block', async () => {
			const messageBlockNum = 258;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
			const messageID = computeMessageId(message1);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					message1,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					randomBytes32()
				)
			).to.be.revertedWith('signature-invalid-length');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
		});

		it('Should not be able to relay message with bad proof in root block', async () => {
			const portalBalance = await provider.getBalance(env.fuelMessagePortal.address);
			const messageReceivingContractBalance = await provider.getBalance(
				messageReceivingContract.address
			);
			const messageBlockNum = 67;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum + 1]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
			const messageID = computeMessageId(message1);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					message1,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					prevRootPoaSignature
				)
			).to.be.revertedWith('Invalid block in history proof');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			expect(await provider.getBalance(env.fuelMessagePortal.address)).to.be.equal(
				portalBalance
			);
			expect(await provider.getBalance(messageReceivingContract.address)).to.be.equal(
				messageReceivingContractBalance
			);
		});

		it('Should be able to relay valid message', async () => {
			const portalBalance = await provider.getBalance(env.fuelMessagePortal.address);
			const messageReceivingContractBalance = await provider.getBalance(
				messageReceivingContract.address
			);
			const messageBlockNum = 145;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
			const messageID = computeMessageId(message1);
			const messageLeafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: messageLeafIndexKey,
				proof: getProof(messageNodes, messageLeafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					message1,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					prevRootPoaSignature
				)
			).to.not.be.reverted;
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				true
			);
			expect(await messageReceivingContract.data1()).to.be.equal(messageTestData1);
			expect(await messageReceivingContract.data2()).to.be.equal(messageTestData2);
			expect(await provider.getBalance(env.fuelMessagePortal.address)).to.be.equal(
				portalBalance
			);
			expect(await provider.getBalance(messageReceivingContract.address)).to.be.equal(
				messageReceivingContractBalance
			);
		});

		it('Should not be able to relay already relayed message', async () => {
			const messageBlockNum = 68;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
			const messageID = computeMessageId(message1);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				true
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					message1,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					prevRootPoaSignature
				)
			).to.be.revertedWith('Already relayed');
		});

		it('Should not be able to relay message with low gas', async () => {
			const messageBlockNum = 11;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
			const messageID = computeMessageId(messageWithAmount);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			const options = {
				gasLimit: onlyEnoughGasForProving,
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					messageWithAmount,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					prevRootPoaSignature,
					options
				)
			).to.be.revertedWith('Insufficient gas for relay');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
		});

		it('Should be able to relay message with amount', async () => {
			const portalBalance = await provider.getBalance(env.fuelMessagePortal.address);
			const messageReceivingContractBalance = await provider.getBalance(
				messageReceivingContract.address
			);
			const messageBlockNum = 333;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
			const messageID = computeMessageId(messageWithAmount);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					messageWithAmount,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					prevRootPoaSignature
				)
			).to.not.be.reverted;
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				true
			);
			expect(await messageReceivingContract.data1()).to.be.equal(messageTestData2);
			expect(await messageReceivingContract.data2()).to.be.equal(messageTestData3);
			expect(await provider.getBalance(env.fuelMessagePortal.address)).to.be.equal(
				portalBalance.sub(messageWithAmount.amount.mul(baseAssetConversion))
			);
			expect(await provider.getBalance(messageReceivingContract.address)).to.be.equal(
				messageReceivingContractBalance.add(
					messageWithAmount.amount.mul(baseAssetConversion)
				)
			);
		});

		it('Should not be able to relay message from untrusted sender', async () => {
			const messageBlockNum = 471;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
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
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					messageBadSender,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					prevRootPoaSignature
				)
			).to.be.revertedWith('Message relay failed');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
		});

		it('Should not be able to relay message to bad recipient', async () => {
			const messageBlockNum = 296;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
			const messageID = computeMessageId(messageBadRecipient);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					messageBadRecipient,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					prevRootPoaSignature
				)
			).to.be.revertedWith('Message relay failed');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
		});

		it('Should not be able to relay message with bad data', async () => {
			const messageBlockNum = 321;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
			const messageID = computeMessageId(messageBadData);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					messageBadData,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					prevRootPoaSignature
				)
			).to.be.revertedWith('Message relay failed');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
		});

		it('Should be able to relay message to EOA', async () => {
			const accountBalance = await provider.getBalance(env.addresses[2]);
			const portalBalance = await provider.getBalance(env.fuelMessagePortal.address);
			const messageBlockNum = 19;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
			const messageID = computeMessageId(messageEOA);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					messageEOA,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					prevRootPoaSignature
				)
			).to.not.be.reverted;
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				true
			);
			expect(await provider.getBalance(env.addresses[2])).to.be.equal(
				accountBalance.add(messageEOA.amount.mul(baseAssetConversion))
			);
			expect(await provider.getBalance(env.fuelMessagePortal.address)).to.be.equal(
				portalBalance.sub(messageEOA.amount.mul(baseAssetConversion))
			);
		});

		it('Should be able to relay message to EOA with no amount', async () => {
			const accountBalance = await provider.getBalance(env.addresses[3]);
			const portalBalance = await provider.getBalance(env.fuelMessagePortal.address);
			const messageBlockNum = 25;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
			const messageID = computeMessageId(messageEOANoAmount);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					messageEOANoAmount,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					prevRootPoaSignature
				)
			).to.not.be.reverted;
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				true
			);
			expect(await provider.getBalance(env.addresses[3])).to.be.equal(accountBalance);
			expect(await provider.getBalance(env.fuelMessagePortal.address)).to.be.equal(
				portalBalance
			);
		});

		it('Should not be able to relay valid message with different amount', async () => {
			const portalBalance = await provider.getBalance(env.fuelMessagePortal.address);
			const messageReceivingContractBalance = await provider.getBalance(
				messageReceivingContract.address
			);
			const messageBlockNum = 68;
			const messageBlockLeafIndexKey = getLeafIndexKey(
				prevBlockNodes,
				blockIds[messageBlockNum]
			);
			const blockInHistoryProof = {
				key: messageBlockLeafIndexKey,
				proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
			};
			const messageID = computeMessageId(message2);
			const leafIndexKey = getLeafIndexKey(messageNodes, messageID);
			const messageInBlockProof = {
				key: leafIndexKey,
				proof: getProof(messageNodes, leafIndexKey),
			};
			const diffBlock = {
				sender: message2.sender,
				recipient: message2.recipient,
				nonce: message2.nonce,
				amount: message2.amount.add(ethers.utils.parseEther('1.0')),
				data: message2.data,
			};
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			await expect(
				env.fuelMessagePortal.relayMessageFromPrevFuelBlock(
					diffBlock,
					prevRootHeader,
					blockHeaders[messageBlockNum],
					blockInHistoryProof,
					messageInBlockProof,
					prevRootPoaSignature
				)
			).to.be.revertedWith('Invalid message in block proof');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
			expect(await provider.getBalance(env.fuelMessagePortal.address)).to.be.equal(
				portalBalance
			);
			expect(await provider.getBalance(messageReceivingContract.address)).to.be.equal(
				messageReceivingContractBalance
			);
		});

		it('Should not be able to relay non-existent message', async () => {
			const portalBalance = await provider.getBalance(env.fuelMessagePortal.address);
			const messageReceivingContractBalance = await provider.getBalance(
				messageReceivingContract.address
			);
			const messageInBlockProof = {
				key: 0,
				proof: [],
			};
			await expect(
				env.fuelMessagePortal.relayMessageFromFuelBlock(
					message2,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.be.revertedWith('Invalid message in block proof');
			expect(await provider.getBalance(env.fuelMessagePortal.address)).to.be.equal(
				portalBalance
			);
			expect(await provider.getBalance(messageReceivingContract.address)).to.be.equal(
				messageReceivingContractBalance
			);
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
			expect(await env.fuelMessagePortal.paused()).to.be.equal(false);

			// Attempt pause
			await expect(env.fuelMessagePortal.connect(env.signers[1]).pause()).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);
			expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
		});

		it('Should be able to pause as owner', async () => {
			expect(await env.fuelMessagePortal.paused()).to.be.equal(false);

			// Pause
			await expect(env.fuelMessagePortal.pause()).to.not.be.reverted;
			expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
		});

		it('Should not be able to unpause as non-owner', async () => {
			expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

			// Attempt unpause
			await expect(
				env.fuelMessagePortal.connect(env.signers[1]).unpause()
			).to.be.revertedWith('Ownable: caller is not the owner');
			expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
		});

		it('Should not be able to relay messages when paused', async () => {
			const messageID = computeMessageId(message2);
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
					message2,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.be.revertedWith('Pausable: paused');
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				false
			);
		});

		it('Should be able to unpause as owner', async () => {
			expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

			// Unpause
			await expect(env.fuelMessagePortal.unpause()).to.not.be.reverted;
			expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
		});

		it('Should be able to relay message when unpaused', async () => {
			const messageID = computeMessageId(message2);
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
					message2,
					blockHeader,
					messageInBlockProof,
					poaSignature
				)
			).to.not.be.reverted;
			expect(await env.fuelMessagePortal.s_incomingMessageSuccessful(messageID)).to.be.equal(
				true
			);
			expect(await messageReceivingContract.data1()).to.be.equal(messageTestData2);
			expect(await messageReceivingContract.data2()).to.be.equal(messageTestData1);
		});
	});
});
