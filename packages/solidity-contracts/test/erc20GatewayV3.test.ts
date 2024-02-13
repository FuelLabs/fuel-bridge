import { MaxUint256 } from 'ethers';
import hre, { deployments } from 'hardhat';

import type {
  FuelERC20GatewayV3,
  MockFuelMessagePortal,
  Token,
} from '../typechain';

import {
  behavesLikeErc20GatewayV2,
  behavesLikeErc20GatewayV3,
} from './behaviors';

describe('erc20GatewayV3', () => {
  const fixture = deployments.createFixture(async ({ ethers, upgrades }) => {
    const { getContractFactory } = ethers;
    const signers = await hre.ethers.getSigners();
    const [deployer] = signers;

    const initializer = 'initialize';
    const fuelMessagePortal = await getContractFactory(
      'MockFuelMessagePortal'
    ).then((factory) => factory.deploy() as Promise<MockFuelMessagePortal>);
    const erc20GatewayV1 = await getContractFactory('FuelERC20Gateway')
      .then(async (factory) =>
        upgrades.deployProxy(factory, [await fuelMessagePortal.getAddress()], {
          initializer,
        })
      )
      .then((tx) => tx.waitForDeployment());

    const token = await hre.ethers
      .getContractFactory('Token')
      .then((factory) => factory.deploy() as Promise<Token>);

    const V2Implementation = await getContractFactory('FuelERC20GatewayV2');
    const V3Implementation = await getContractFactory('FuelERC20GatewayV3');

    await upgrades.upgradeProxy(erc20GatewayV1, V2Implementation);
    const erc20Gateway = (await upgrades
      .upgradeProxy(erc20GatewayV1, V3Implementation)
      .then((tx) => tx.waitForDeployment())) as FuelERC20GatewayV3;

    await erc20Gateway.setGlobalDepositLimit(token, MaxUint256);

    return {
      fuelMessagePortal,
      erc20Gateway,
      V2Implementation,
      token,
      signers,
      deployer,
    };
  });

  behavesLikeErc20GatewayV2(fixture);
  behavesLikeErc20GatewayV3(fixture);
});
