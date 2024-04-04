import { zeroPadValue } from 'ethers';
import hre, { deployments } from 'hardhat';

import { randomBytes32 } from '../protocol/utils';
import {
  FuelERC20GatewayV4__factory,
  type MockFuelMessagePortal,
  type Token,
} from '../typechain';

import { behavesLikeErc20GatewayV4 } from './behaviors';
import { deployProxy } from './utils';

describe.skip('erc20GatewayV4', () => {
  const fixture = deployments.createFixture(async ({ ethers, upgrades }) => {
    const { getContractFactory } = ethers;
    const signers = await hre.ethers.getSigners();
    const [deployer] = signers;

    const initializer = 'initialize';
    const fuelMessagePortal = await getContractFactory(
      'MockFuelMessagePortal'
    ).then((factory) => factory.deploy() as Promise<MockFuelMessagePortal>);

    const token = await hre.ethers
      .getContractFactory('Token')
      .then((factory) => factory.deploy() as Promise<Token>);

    const assetIssuerId = zeroPadValue(randomBytes32(), 32);
    const [erc20Gateway] = await deployProxy(
      FuelERC20GatewayV4__factory,
      upgrades,
      deployer,
      [await fuelMessagePortal.getAddress()],
      { initializer }
    );

    await erc20Gateway.connect(deployer).setAssetIssuerId(assetIssuerId);

    return {
      fuelMessagePortal,
      erc20Gateway,
      assetIssuerId,
      token,
      signers,
      deployer,
    };
  });

  behavesLikeErc20GatewayV4(fixture);
});
