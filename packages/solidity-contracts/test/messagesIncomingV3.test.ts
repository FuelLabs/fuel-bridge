import { expect } from 'chai';
import { deployments, ethers, upgrades } from 'hardhat';

import type {
  FuelChainState,
  MessageTester,
  FuelMessagePortalV3,
} from '../typechain';

import {
  BLOCKS_PER_COMMIT_INTERVAL,
  COMMIT_COOLDOWN,
  TIME_TO_FINALIZE,
} from './utils/merkle';
import { behavesLikeFuelMessagePortalV3 } from './behaviors/FuelMessagePortalV3.L2toL1.behavior.test';
import { MaxUint256 } from 'ethers';

const DEPOSIT_LIMIT = MaxUint256;

describe('FuelMessagePortalV3 - Incoming messages', () => {
  const fixture = deployments.createFixture(
    async ({ ethers, upgrades: { deployProxy } }) => {
      const signers = await ethers.getSigners();
      const [deployer] = signers;

      const proxyOptions = {
        initializer: 'initialize',
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

      const FuelMessagePortalV3 = await ethers.getContractFactory(
        'FuelMessagePortalV3'
      );
      const fuelMessagePortal = (await upgrades.deployProxy(
        FuelMessagePortalV3,
        [await fuelChainState.getAddress()],
        { ...proxyOptions, constructorArgs: [DEPOSIT_LIMIT] }
      )) as unknown as FuelMessagePortalV3;

      const messageTester = await ethers
        .getContractFactory('MessageTester', deployer)
        .then(
          async (factory) =>
            factory.deploy(fuelMessagePortal) as Promise<MessageTester>
        );

      return {
        deployer,
        signers,
        fuelMessagePortal,
        fuelChainState,
        messageTester,
        addresses: signers.map(({ address }) => address),
      };
    }
  );

  it('can upgrade from V1 to V2 to V3', async () => {
    // const { fuelMessagePortal, V2Implementation, V3Implementation } =
    //   await fixture();

    const [deployer] = await ethers.getSigners();

    const V2Implementation = await ethers.getContractFactory(
      'FuelMessagePortalV2'
    );

    const V3Implementation = await ethers.getContractFactory(
      'FuelMessagePortalV3'
    );

    const proxyOptions = {
      initializer: 'initialize',
    };

    const fuelChainState = (await ethers
      .getContractFactory('FuelChainState', deployer)
      .then(async (factory) =>
        upgrades.deployProxy(factory, [], {
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
        upgrades.deployProxy(
          factory,
          [await fuelChainState.getAddress()],
          proxyOptions
        )
      )
      .then((tx) => tx.waitForDeployment());

    const fuelMessagePortal = V3Implementation.attach(deployment).connect(
      deployment.runner
    ) as FuelMessagePortalV3;

    await expect(fuelMessagePortal.depositLimitGlobal()).to.be.reverted;

    await upgrades.upgradeProxy(fuelMessagePortal, V2Implementation, {
      unsafeAllow: ['constructor'],
      constructorArgs: [0],
    });

    await expect(fuelMessagePortal.pauseWithdrawals()).to.be.reverted;

    await upgrades.upgradeProxy(fuelMessagePortal, V3Implementation, {
      unsafeAllow: ['constructor'],
      constructorArgs: [0],
    });

    await fuelMessagePortal.pauseWithdrawals();
    expect(await fuelMessagePortal.withdrawalsPaused()).to.be.true;
  });

  behavesLikeFuelMessagePortalV3(fixture);
});
