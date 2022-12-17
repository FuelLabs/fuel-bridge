import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { HarnessObject, setupFuel, upgradeFuel } from '../protocol/harness';
import { UpgradeableTester } from '../typechain/UpgradeableTester.d';

chai.use(solidity);
const { expect } = chai;

describe('Contract Upgradability', async () => {
	let env: HarnessObject;
	let upgradeableTester: UpgradeableTester;

	before(async () => {
		env = await setupFuel();

		// Deploy contracts for abstract upgradeable contract testing.
		const upgradeableTesterContractFactory = await ethers.getContractFactory('UpgradeableTester');
		upgradeableTester = (await upgradeableTesterContractFactory.deploy()) as UpgradeableTester;
		await upgradeableTester.deployed();
	});

	describe('Upgrade contracts', async () => {
		it('Should be able to upgrade contracts', async () => {
			const contracts = {
				FuelSidechainConsensus: env.fuelSidechain.address,
				FuelMessagePortal: env.fuelMessagePortal.address,
				L1ERC20Gateway: env.l1ERC20Gateway.address,
			};
			const upgradedContracts = await upgradeFuel(contracts);

			expect(upgradedContracts.FuelSidechainConsensus).to.equal(env.fuelSidechain.address);
			expect(upgradedContracts.FuelMessagePortal).to.equal(env.fuelMessagePortal.address);
			expect(upgradedContracts.L1ERC20Gateway).to.equal(env.l1ERC20Gateway.address);
		});

		it('Should not be able to call initializers', async () => {
			await expect(env.fuelSidechain.initialize(env.signer)).to.be.revertedWith(
				'Initializable: contract is already initialized'
			);
			await expect(env.fuelMessagePortal.initialize(env.fuelSidechain.address)).to.be.revertedWith(
				'Initializable: contract is already initialized'
			);
			await expect(env.l1ERC20Gateway.initialize(env.fuelMessagePortal.address)).to.be.revertedWith(
				'Initializable: contract is already initialized'
			);
		});

		it('Should not be able to call init functions for upgradeable abstract contracts', async () => {
			await expect(
				upgradeableTester.testFuelMessagesEnabledInit(env.fuelMessagePortal.address)
			).to.be.revertedWith('Initializable: contract is not initializing');
			await expect(
				upgradeableTester.testFuelMessagesEnabledInitUnchained(env.fuelMessagePortal.address)
			).to.be.revertedWith('Initializable: contract is not initializing');
		});

		it('Should not be able to upgrade contracts as non-owner', async () => {
			await expect(env.fuelSidechain.connect(env.signers[1]).upgradeTo(env.addresses[1])).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);
			await expect(env.fuelMessagePortal.connect(env.signers[1]).upgradeTo(env.addresses[1])).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);
			await expect(env.l1ERC20Gateway.connect(env.signers[1]).upgradeTo(env.addresses[1])).to.be.revertedWith(
				'Ownable: caller is not the owner'
			);
		});
	});
});
