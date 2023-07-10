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
        const defaultAdminRole = '0x0000000000000000000000000000000000000000000000000000000000000000';
        it('Should be able to upgrade contracts', async () => {
            const contracts = {
                FuelChainState: env.fuelChainState.address,
                FuelMessagePortal: env.fuelMessagePortal.address,
                FuelERC20Gateway: env.fuelERC20Gateway.address,
                FuelChainState_impl: '',
                FuelMessagePortal_impl: '',
                FuelERC20Gateway_impl: '',
            };
            const upgradedContracts = await upgradeFuel(contracts);

            expect(upgradedContracts.FuelChainState).to.equal(env.fuelChainState.address);
            expect(upgradedContracts.FuelMessagePortal).to.equal(env.fuelMessagePortal.address);
            expect(upgradedContracts.FuelERC20Gateway).to.equal(env.fuelERC20Gateway.address);
        });

        it('Should not be able to call initializers', async () => {
            await expect(env.fuelChainState.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
            await expect(env.fuelMessagePortal.initialize(env.fuelChainState.address)).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
            await expect(env.fuelERC20Gateway.initialize(env.fuelMessagePortal.address)).to.be.revertedWith(
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

        it('Should not be able to upgrade contracts as non-admin', async () => {
            await expect(env.fuelChainState.connect(env.signers[1]).upgradeTo(env.addresses[1])).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            await expect(env.fuelMessagePortal.connect(env.signers[1]).upgradeTo(env.addresses[1])).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            await expect(env.fuelERC20Gateway.connect(env.signers[1]).upgradeTo(env.addresses[1])).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
        });
    });
});
