import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { BigNumber as BN } from 'ethers';
import { Provider } from '@ethersproject/abstract-provider';
import { MessageTester } from '../typechain/MessageTester.d';
import { HarnessObject, setupFuel } from '../protocol/harness';
import { randomBytes, randomBytes32 } from '../protocol/utils';

chai.use(solidity);
const { expect } = chai;

describe('Outgoing Messages', async () => {
	let env: HarnessObject;

	// Testing contracts
	let messageTester: MessageTester;

	before(async () => {
		env = await setupFuel();

		// Deploy contracts for message testing
		const messageTesterContractFactory = await ethers.getContractFactory('MessageTester');
		messageTester = (await messageTesterContractFactory.deploy(env.fuelMessagePortal.address)) as MessageTester;
		await messageTester.deployed();

		// Send eth to contract
		const tx = {
			to: messageTester.address,
			value: ethers.utils.parseEther('2'),
		};
		const transaction = await env.signers[0].sendTransaction(tx);
		await transaction.wait();
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
			await expect(env.fuelMessagePortal.connect(env.signers[1]).transferOwnership(signer0)).to.not.be.reverted;
			expect(await env.fuelMessagePortal.owner()).to.be.equal(signer0);
		});
	});

	describe('Send messages', async () => {
		let provider: Provider;
		let filterAddress: string;
		let fuelBaseAssetDecimals: number;
		let baseAssetConversion: number;
		before(async () => {
			provider = env.fuelMessagePortal.provider;
			filterAddress = env.fuelMessagePortal.address;
			fuelBaseAssetDecimals = await env.fuelMessagePortal.getFuelBaseAssetDecimals();
			baseAssetConversion = 10 ** (18 - fuelBaseAssetDecimals);
		});

		it('Should be able to send message with data', async () => {
			const recipient = randomBytes32();
			const data = randomBytes(16);
			const nonce = await env.fuelMessagePortal.s_outgoingMessageNonce();
			await expect(messageTester.attemptSendMessage(recipient, data)).to.not.be.reverted;

			// Check logs for message sent
			const logs = await provider.getLogs({ address: filterAddress });
			const sentMessageEvent = env.fuelMessagePortal.interface.parseLog(logs[logs.length - 1]);
			expect(sentMessageEvent.name).to.equal('SentMessage');
			expect(sentMessageEvent.args.sender).to.equal(
				messageTester.address.split('0x').join('0x000000000000000000000000').toLowerCase()
			);
			expect(sentMessageEvent.args.recipient).to.equal(recipient);
			expect(sentMessageEvent.args.data).to.equal(data);
			expect(sentMessageEvent.args.amount).to.equal(0);
			expect(sentMessageEvent.args.nonce).to.equal(nonce);

			// Check that nonce increased
			expect(await env.fuelMessagePortal.s_outgoingMessageNonce()).to.not.equal(nonce);
		});

		it('Should be able to send message without data', async () => {
			const recipient = randomBytes32();
			const nonce = await env.fuelMessagePortal.s_outgoingMessageNonce();
			await expect(messageTester.attemptSendMessage(recipient, [])).to.not.be.reverted;

			// Check logs for message sent
			const logs = await provider.getLogs({ address: filterAddress });
			const sentMessageEvent = env.fuelMessagePortal.interface.parseLog(logs[logs.length - 1]);
			expect(sentMessageEvent.name).to.equal('SentMessage');
			expect(sentMessageEvent.args.sender).to.equal(
				messageTester.address.split('0x').join('0x000000000000000000000000').toLowerCase()
			);
			expect(sentMessageEvent.args.recipient).to.equal(recipient);
			expect(sentMessageEvent.args.data).to.equal('0x');
			expect(sentMessageEvent.args.amount).to.equal(0);
			expect(sentMessageEvent.args.nonce).to.equal(nonce);

			// Check that nonce increased
			expect(await env.fuelMessagePortal.s_outgoingMessageNonce()).to.not.equal(nonce);
		});

		it('Should be able to send message with amount and data', async () => {
			const recipient = randomBytes32();
			const data = randomBytes(8);
			const nonce = await env.fuelMessagePortal.s_outgoingMessageNonce();
			const portalBalance = await provider.getBalance(env.fuelMessagePortal.address);
			await expect(messageTester.attemptSendMessageWithAmount(recipient, ethers.utils.parseEther('0.1'), data)).to
				.not.be.reverted;

			// Check logs for message sent
			const logs = await provider.getLogs({ address: filterAddress });
			const sentMessageEvent = env.fuelMessagePortal.interface.parseLog(logs[logs.length - 1]);
			expect(sentMessageEvent.name).to.equal('SentMessage');
			expect(sentMessageEvent.args.sender).to.equal(
				messageTester.address.split('0x').join('0x000000000000000000000000').toLowerCase()
			);
			expect(sentMessageEvent.args.recipient).to.equal(recipient);
			expect(sentMessageEvent.args.data).to.equal(data);
			expect(sentMessageEvent.args.amount).to.equal(ethers.utils.parseEther('0.1').div(baseAssetConversion));
			expect(sentMessageEvent.args.nonce).to.equal(nonce);

			// Check that nonce increased
			expect(await env.fuelMessagePortal.s_outgoingMessageNonce()).to.not.equal(nonce);

			// Check that portal balance increased
			expect(await provider.getBalance(env.fuelMessagePortal.address)).to.equal(
				portalBalance.add(ethers.utils.parseEther('0.1'))
			);
		});

		it('Should be able to send message with amount and without data', async () => {
			const recipient = randomBytes32();
			const nonce = await env.fuelMessagePortal.s_outgoingMessageNonce();
			const portalBalance = await provider.getBalance(env.fuelMessagePortal.address);
			await expect(messageTester.attemptSendMessageWithAmount(recipient, ethers.utils.parseEther('0.5'), [])).to
				.not.be.reverted;

			// Check logs for message sent
			const logs = await provider.getLogs({ address: filterAddress });
			const sentMessageEvent = env.fuelMessagePortal.interface.parseLog(logs[logs.length - 1]);
			expect(sentMessageEvent.name).to.equal('SentMessage');
			expect(sentMessageEvent.args.sender).to.equal(
				messageTester.address.split('0x').join('0x000000000000000000000000').toLowerCase()
			);
			expect(sentMessageEvent.args.recipient).to.equal(recipient);
			expect(sentMessageEvent.args.data).to.equal('0x');
			expect(sentMessageEvent.args.amount).to.equal(ethers.utils.parseEther('0.5').div(baseAssetConversion));
			expect(sentMessageEvent.args.nonce).to.equal(nonce);

			// Check that nonce increased
			expect(await env.fuelMessagePortal.s_outgoingMessageNonce()).to.not.equal(nonce);

			// Check that portal balance increased
			expect(await provider.getBalance(env.fuelMessagePortal.address)).to.equal(
				portalBalance.add(ethers.utils.parseEther('0.5'))
			);
		});

		it('Should not be able to send message with amount too small', async () => {
			const recipient = randomBytes32();
			await expect(
				env.fuelMessagePortal.sendMessage(recipient, [], {
					value: 1,
				})
			).to.be.revertedWith('amount-precision-incompatability');
		});

		it('Should not be able to send message with amount too big', async () => {
			const recipient = randomBytes32();
			await ethers.provider.send('hardhat_setBalance', [env.addresses[0], '0xf00000000000000000000000']);
			await expect(
				env.fuelMessagePortal.sendMessage(recipient, [], {
					value: BN.from('0x3b9aca000000000000000000'),
				})
			).to.be.revertedWith('amount-precision-incompatability');
		});

		it('Should not be able to send message with too much data', async () => {
			const recipient = randomBytes32();
			const data = new Uint8Array(65536 + 1);
			await expect(env.fuelMessagePortal.sendMessage(recipient, data)).to.be.revertedWith(
				'message-data-too-large'
			);
		});

		it('Should be able to send message with only ETH', async () => {
			const recipient = randomBytes32();
			const nonce = await env.fuelMessagePortal.s_outgoingMessageNonce();
			await expect(
				env.fuelMessagePortal.sendETH(recipient, {
					value: ethers.utils.parseEther('1.234'),
				})
			).to.not.be.reverted;

			// Check logs for message sent
			const logs = await provider.getLogs({ address: filterAddress });
			const sentMessageEvent = env.fuelMessagePortal.interface.parseLog(logs[logs.length - 1]);
			expect(sentMessageEvent.name).to.equal('SentMessage');
			expect(sentMessageEvent.args.sender).to.equal(
				env.addresses[0].split('0x').join('0x000000000000000000000000').toLowerCase()
			);
			expect(sentMessageEvent.args.recipient).to.equal(recipient);
			expect(sentMessageEvent.args.data).to.equal('0x');
			expect(sentMessageEvent.args.amount).to.equal(ethers.utils.parseEther('1.234').div(baseAssetConversion));
			expect(sentMessageEvent.args.nonce).to.equal(nonce);

			// Check that nonce increased
			expect(await env.fuelMessagePortal.s_outgoingMessageNonce()).to.not.equal(nonce);
		});
	});

	describe('Verify pause and unpause', async () => {
		const recipient = randomBytes32();
		const data = randomBytes(8);

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
			await expect(env.fuelMessagePortal.connect(env.signers[1]).unpause()).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);
			expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
		});

		it('Should not be able to send messages when paused', async () => {
			expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
			await expect(env.fuelMessagePortal.sendMessage(recipient, data)).to.be.revertedWith('Pausable: paused');
			await expect(env.fuelMessagePortal.sendETH(recipient, { value: 1 })).to.be.revertedWith('Pausable: paused');
		});

		it('Should be able to unpause as owner', async () => {
			expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

			// Unpause
			await expect(env.fuelMessagePortal.unpause()).to.not.be.reverted;
			expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
		});

		it('Should be able to send messages when unpaused', async () => {
			expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
			await expect(env.fuelMessagePortal.sendMessage(recipient, data)).to.not.be.reverted;
		});
	});
});
