import { MaxUint256, parseUnits } from 'ethers';
import hre from 'hardhat';

import type { FuelMessagePortalV4 } from '../typechain';

import {
  behavesLikeAccessControl,
  behavesLikeFuelMessagePortalV4,
} from './behaviors';
import { BLOCKS_PER_COMMIT_INTERVAL, TIME_TO_FINALIZE } from './utils';

const DEPOSIT_LIMIT = MaxUint256;
const GAS_LIMIT = 1_000;
const MIN_GAS_PRICE = parseUnits('1', 'gwei');
const MIN_GAS_PER_TX = 1;

describe.only('FuelMessagePortalV4', () => {
  const fixture = hre.deployments.createFixture(
    async ({ ethers, upgrades }) => {
      const signers = await ethers.getSigners();
      const FuelMessagePortal = await ethers.getContractFactory(
        'FuelMessagePortalV4'
      );
      const FuelChainState = await ethers.getContractFactory('FuelChainState');
      const fuelChainState = await upgrades.deployProxy(FuelChainState, {
        initializer: 'initialize',
        constructorArgs: [
          TIME_TO_FINALIZE,
          BLOCKS_PER_COMMIT_INTERVAL,
          TIME_TO_FINALIZE,
        ],
      });

      const fuelMessagePortal = (await upgrades.deployProxy(
        FuelMessagePortal,
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

      return { signers, fuelMessagePortal };
    }
  );

  behavesLikeAccessControl(fixture, 'fuelMessagePortal');
  behavesLikeFuelMessagePortalV4(fixture);
});
