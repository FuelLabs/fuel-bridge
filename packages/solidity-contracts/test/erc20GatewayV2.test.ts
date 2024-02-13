import hre, { deployments } from 'hardhat';

import type {
  FuelERC20GatewayV2,
  MockFuelMessagePortal,
  Token,
} from '../typechain';

import { behavesLikeErc20GatewayV2 } from './behaviors';

describe.only('erc20GatewayV2', () => {
  const fixture = deployments.createFixture(async ({ upgrades }) => {
    const signers = await hre.ethers.getSigners();
    const [deployer] = signers;

    const initializer = 'initialize';
    const fuelMessagePortal = await hre.ethers
      .getContractFactory('MockFuelMessagePortal')
      .then((factory) => factory.deploy() as Promise<MockFuelMessagePortal>);
    const erc20GatewayV1 = await hre.ethers
      .getContractFactory('FuelERC20Gateway')
      .then(async (factory) =>
        hre.upgrades.deployProxy(
          factory,
          [await fuelMessagePortal.getAddress()],
          {
            initializer,
          }
        )
      );

    const token = await hre.ethers
      .getContractFactory('Token')
      .then((factory) => factory.deploy() as Promise<Token>);

    const V2Implementation = await hre.ethers.getContractFactory(
      'FuelERC20GatewayV2'
    );

    const erc20Gateway = (await upgrades
      .upgradeProxy(erc20GatewayV1, V2Implementation)
      .then((tx) => tx.waitForDeployment())) as FuelERC20GatewayV2;

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
