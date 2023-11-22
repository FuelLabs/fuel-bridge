import hre, { deployments } from 'hardhat';

import { FuelERC20GatewayV2__factory } from '../typechain';
import type { MockFuelMessagePortal, Token } from '../typechain';

import { behavesLikeErc20GatewayV2 } from './behaviors';

describe.only('erc20GatewayV2', () => {
  const fixture = deployments.createFixture(async ({ upgrades }) => {
    const signers = await hre.ethers.getSigners();
    const [deployer] = signers;

    const initializer = 'initialize';
    const fuelMessagePortal = await hre.ethers
      .getContractFactory('MockFuelMessagePortal')
      .then((factory) => factory.deploy() as Promise<MockFuelMessagePortal>);
    const erc20Gateway = await hre.ethers
      .getContractFactory('FuelERC20Gateway')
      .then((factory) =>
        hre.upgrades.deployProxy(factory, [fuelMessagePortal.address], {
          initializer,
        })
      )
      .then(({ address }) =>
        FuelERC20GatewayV2__factory.connect(address, deployer)
      );

    const token = await hre.ethers
      .getContractFactory('Token')
      .then((factory) => factory.deploy() as Promise<Token>);

    const V2Implementation = await hre.ethers.getContractFactory(
      'FuelERC20GatewayV2'
    );

    await upgrades.upgradeProxy(erc20Gateway, V2Implementation);

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
});
