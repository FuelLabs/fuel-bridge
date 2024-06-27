import { MaxUint256, parseUnits } from 'ethers';
import hre from 'hardhat';

import type {
  FuelChainState,
  FuelMessagePortalV3,
  FuelMessagePortalV4,
} from '../typechain';

import {
  behavesLikeAccessControl,
  behavesLikeFuelMessagePortalV4,
} from './behaviors';
import { BLOCKS_PER_COMMIT_INTERVAL, TIME_TO_FINALIZE } from './utils';
import { behavesLikeFuelMessagePortalV3 } from './behaviors/FuelMessagePortalV3.L2toL1.behavior.test';
import { expect } from 'chai';

const DEPOSIT_LIMIT = MaxUint256;
const GAS_LIMIT = 1_000;
const MIN_GAS_PRICE = parseUnits('1', 'gwei');
const MIN_GAS_PER_TX = 1;

describe.only('FuelMessagePortalV4', () => {
  const fixture = hre.deployments.createFixture(
    async ({ ethers, upgrades }) => {
      const signers = await ethers.getSigners();
      const FuelMessagePortalV4 = await ethers.getContractFactory(
        'FuelMessagePortalV4'
      );
      const FuelChainState = await ethers.getContractFactory('FuelChainState');
      const fuelChainState = (await upgrades.deployProxy(FuelChainState, {
        initializer: 'initialize',
        constructorArgs: [
          TIME_TO_FINALIZE,
          BLOCKS_PER_COMMIT_INTERVAL,
          TIME_TO_FINALIZE,
        ],
      })) as unknown as FuelChainState;

      const fuelMessagePortal = (await upgrades.deployProxy(
        FuelMessagePortalV4,
        [await fuelChainState.getAddress()],
        {
          initializer: 'initialize',
          constructorArgs: [
            DEPOSIT_LIMIT,
            GAS_LIMIT,
            MIN_GAS_PER_TX,
            MIN_GAS_PRICE,
          ],
        }
      )) as unknown as FuelMessagePortalV4;

      const messageTester = await ethers
        .getContractFactory('MessageTester', signers[0])
        .then(async (f) => f.deploy(fuelMessagePortal));

      return { signers, fuelMessagePortal, messageTester, fuelChainState };
    }
  );

  it('can upgrade from V3 to V4', async () => {
    const V3 = await hre.ethers.getContractFactory('FuelMessagePortalV3');
    const V4 = await hre.ethers.getContractFactory('FuelMessagePortalV4');

    const fuelChainState = await hre.ethers
      .getContractFactory('FuelChainState')
      .then((f) =>
        f.deploy(TIME_TO_FINALIZE, BLOCKS_PER_COMMIT_INTERVAL, TIME_TO_FINALIZE)
      );

    const proxy = await hre.upgrades.deployProxy(
      V3,
      [await fuelChainState.getAddress()],
      {
        initializer: 'initialize',
        constructorArgs: [0],
      }
    );

    const contract = V4.attach(proxy) as unknown as FuelMessagePortalV4;

    // Check a function of V3
    await contract.withdrawalsPaused();

    // Check a function of V4 reverts
    await expect(contract.getLastSeenBlock()).to.be.reverted;

    // Upgrade
    await hre.upgrades.upgradeProxy(contract, V4, {
      constructorArgs: [
        DEPOSIT_LIMIT,
        GAS_LIMIT,
        MIN_GAS_PER_TX,
        MIN_GAS_PRICE,
      ],
    });

    // Check a function of V4 no longer reverts
    await expect(contract.getLastSeenBlock()).not.to.be.reverted;
  });

  behavesLikeAccessControl(fixture, 'fuelMessagePortal');
  behavesLikeFuelMessagePortalV3(fixture);
  behavesLikeFuelMessagePortalV4(fixture);
});
