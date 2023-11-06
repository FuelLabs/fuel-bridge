import { constants } from 'ethers';
import hre, { deployments } from 'hardhat';

import { FuelERC20GatewayV3__factory } from '../typechain';
import type { MockFuelMessagePortal, Token } from '../typechain';

import {
  behavesLikeErc20GatewayV2,
  behavesLikeErc20GatewayV3,
} from './behaviors';

describe.only('erc20GatewayV3', () => {
  const fixture = deployments.createFixture(async ({ ethers, upgrades }) => {
    const { getContractFactory } = ethers;
    const signers = await hre.ethers.getSigners();
    const [deployer] = signers;

    const initializer = 'initialize';
    const fuelMessagePortal = await getContractFactory(
      'MockFuelMessagePortal'
    ).then((factory) => factory.deploy() as Promise<MockFuelMessagePortal>);
    const erc20Gateway = await getContractFactory('FuelERC20Gateway')
      .then((factory) =>
        upgrades.deployProxy(factory, [fuelMessagePortal.address], {
          initializer,
        })
      )
      .then(({ address }) =>
        FuelERC20GatewayV3__factory.connect(address, deployer)
      );

    const token = await hre.ethers
      .getContractFactory('Token')
      .then((factory) => factory.deploy() as Promise<Token>);

    const V2Implementation = await getContractFactory('FuelERC20GatewayV2');
    const V3Implementation = await getContractFactory('FuelERC20GatewayV3');

    await upgrades.upgradeProxy(erc20Gateway, V2Implementation);
    await upgrades.upgradeProxy(erc20Gateway, V3Implementation);

    await erc20Gateway.setGlobalDepositLimit(
      token.address,
      constants.MaxUint256
    );
    await erc20Gateway.setPerAccountDepositLimit(
      token.address,
      constants.MaxUint256
    );

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
