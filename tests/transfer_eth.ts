import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'ethers';
import { TestEnvironment, setupEnvironment } from '../scripts/setup';
import { fuels_parseEther, fuels_formatEther } from '../scripts/utils';

chai.use(solidity);
const { expect } = chai;

describe('Transferring ETH', async () => {
	const ethAssetId = "0x0000000000000000000000000000000000000000000000000000000000000000";
	let env: TestEnvironment;

	before(async () => {
		env = await setupEnvironment({});
	});

	describe('Send ETH to Fuel', async () => {
		let fuelETHReceiver: string;
		let fuelETHReceiverBalance: string;
		before(async () => {
			fuelETHReceiver = env.fuel.signers[0].address;
			fuelETHReceiverBalance = fuels_formatEther(await env.fuel.provider.getBalance(fuelETHReceiver, ethAssetId));
			//console.log('fuelETHReceiverBalance 1: ' + fuelETHReceiverBalance)
			let net = (await env.eth.provider.getNetwork());
			//console.log("chainID: " + net.chainId)
		});

		it('Send ETH via MessagePortal', async () => {
			// use the FuelMessagePortal to directly send ETH which should be immediately spendable
			await expect(
				env.eth.fuelMessagePortal.sendETH(fuelETHReceiver, {
					value: ethers.utils.parseEther("0.1")
				})
			).to.not.be.reverted;
		});

		it('Check ETH arrived on Fuel', async () => {
			//TODO
			//fuels_formatEther(...) == "0.1"
			fuelETHReceiverBalance = fuels_formatEther(await env.fuel.provider.getBalance(fuelETHReceiver, ethAssetId));
			//console.log('fuelETHReceiverBalance 2: ' + fuelETHReceiverBalance)
		});
	});

	describe('Send ETH from Fuel', async () => {
		it('Send ETH via OutputMessage', async () => {
			//TODO
			//fuels_parseEther("0.1")
		});

		it('Relay Message from Fuel on Ethereum', async () => {
			//TODO
		});

		it('Check ETH arrived on Ethereum', async () => {
			//TODO
		});
	});
});
