import chai from 'chai';
import { ethers } from 'hardhat';

import type {
  DeployedContractAddresses,
  HarnessObject,
} from '../protocol/harness';

import { RATE_LIMIT_AMOUNT, RATE_LIMIT_DURATION } from '../protocol/constants';

import { setupFuel, upgradeFuel } from '../protocol/harness';
import type { UpgradeableTester } from '../typechain';

const { expect } = chai;

describe('Contract Upgradability', async () => {
  let env: HarnessObject;
  let upgradeableTester: UpgradeableTester;

  let fuelChainStateAddress: string;
  let fuelMessagePortalAddress: string;
  let tokenGatewayAddress: string;
  let nftGatewayAddress: string;

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

    fuelChainStateAddress = await env.fuelChainState.getAddress();
    fuelMessagePortalAddress = await env.fuelMessagePortal.getAddress();
    tokenGatewayAddress = await env.fuelERC20Gateway.getAddress();
    nftGatewayAddress = await env.fuelERC721Gateway.getAddress();
  });

  describe('Upgrade contracts', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    it('Should be able to upgrade contracts', async () => {
      const contracts: DeployedContractAddresses = {
        FuelChainState: fuelChainStateAddress,
        FuelMessagePortal: fuelMessagePortalAddress,
        FuelERC20Gateway: tokenGatewayAddress,
        FuelERC721Gateway: nftGatewayAddress,
        FuelChainState_impl: '',
        FuelMessagePortal_impl: '',
        FuelERC20Gateway_impl: '',
        FuelERC721Gateway_impl: '',
      };
      const upgradedContracts = await upgradeFuel(contracts, env.deployer);

      expect(upgradedContracts.FuelChainState).to.equal(fuelChainStateAddress);
      expect(upgradedContracts.FuelMessagePortal).to.equal(
        fuelMessagePortalAddress
      );
      expect(upgradedContracts.FuelERC20Gateway).to.equal(tokenGatewayAddress);
    });

    it('Should not be able to call initializers', async () => {
      await expect(env.fuelChainState.initialize()).to.be.revertedWith(
        'Initializable: contract is already initialized'
      );
      await expect(
        env.fuelMessagePortal.initialize(
          fuelChainStateAddress,
          RATE_LIMIT_AMOUNT.toString(),
          RATE_LIMIT_DURATION
        )
      ).to.be.revertedWith('Initializable: contract is already initialized');
      await expect(
        env.fuelERC20Gateway.initialize(fuelMessagePortalAddress)
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('Should not be able to call init functions for upgradeable abstract contracts', async () => {
      await expect(
        upgradeableTester.testFuelMessagesEnabledInit(fuelMessagePortalAddress)
      ).to.be.revertedWith('Initializable: contract is not initializing');
      await expect(
        upgradeableTester.testFuelMessagesEnabledInitUnchained(
          fuelMessagePortalAddress
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
