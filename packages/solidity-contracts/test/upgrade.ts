import chai from 'chai';
import { ethers } from 'hardhat';

import type {
  DeployedContractAddresses,
  HarnessObject,
} from '../protocol/harness';
import { setupFuel, upgradeFuel } from '../protocol/harness';
import type { UpgradeableTester } from '../typechain';

const { expect } = chai;

describe.only('Contract Upgradability', async () => {
  let env: HarnessObject;
  let upgradeableTester: UpgradeableTester;

  before(async () => {
    env = await setupFuel();

    // Deploy contracts for abstract upgradeable contract testing.
    const upgradeableTesterContractFactory = await ethers.getContractFactory(
      'UpgradeableTester',
      env.deployer
    );
    upgradeableTester = (await upgradeableTesterContractFactory
      .deploy()
      .then((tx) => tx.waitForDeployment())) as UpgradeableTester;
  });

  describe('Upgrade contracts', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    it('Should be able to upgrade contracts', async () => {
      const contracts: DeployedContractAddresses = {
        FuelChainState: await env.fuelChainState.getAddress(),
        FuelMessagePortal: await env.fuelMessagePortal.getAddress(),
        FuelERC20Gateway: await env.fuelERC20Gateway.getAddress(),
        FuelERC721Gateway: await env.fuelERC721Gateway.getAddress(),
        FuelChainState_impl: '',
        FuelMessagePortal_impl: '',
        FuelERC20Gateway_impl: '',
        FuelERC721Gateway_impl: '',
      };
      const upgradedContracts = await upgradeFuel(contracts, env.deployer);

      expect(upgradedContracts.FuelChainState).to.equal(
        await env.fuelChainState.getAddress()
      );
      expect(upgradedContracts.FuelMessagePortal).to.equal(
        await env.fuelMessagePortal.getAddress()
      );
      expect(upgradedContracts.FuelERC20Gateway).to.equal(
        await env.fuelERC20Gateway.getAddress()
      );
    });

    it('Should not be able to call initializers', async () => {
      await expect(env.fuelChainState.initialize()).to.be.revertedWith(
        'Initializable: contract is already initialized'
      );
      await expect(
        env.fuelMessagePortal.initialize(await env.fuelChainState.getAddress())
      ).to.be.revertedWith('Initializable: contract is already initialized');
      await expect(
        env.fuelERC20Gateway.initialize(
          await env.fuelMessagePortal.getAddress()
        )
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('Should not be able to call init functions for upgradeable abstract contracts', async () => {
      await expect(
        upgradeableTester.testFuelMessagesEnabledInit(
          await env.fuelMessagePortal.getAddress()
        )
      ).to.be.revertedWith('Initializable: contract is not initializing');
      await expect(
        upgradeableTester.testFuelMessagesEnabledInitUnchained(
          await env.fuelMessagePortal.getAddress()
        )
      ).to.be.revertedWith('Initializable: contract is not initializing');
    });

    it('Should not be able to upgrade contracts as non-admin', async () => {
      await expect(
        env.fuelChainState.connect(env.signers[1]).upgradeTo(env.addresses[1])
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      await expect(
        env.fuelMessagePortal
          .connect(env.signers[1])
          .upgradeTo(env.addresses[1])
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      await expect(
        env.fuelERC20Gateway.connect(env.signers[1]).upgradeTo(env.addresses[1])
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });
  });
});
