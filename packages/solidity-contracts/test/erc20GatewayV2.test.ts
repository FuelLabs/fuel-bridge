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

  // let env: Env;

  // before('fixture', async () => {
  //   env = await fixture();
  // });

  // it('can upgrade from V1', async () => {
  //   const { erc20Gateway, V2Implementation } = env;

  //   await expect(erc20Gateway.isBridge(randomBytes32(), randomAddress())).to.be
  //     .reverted;

  //   await hre.upgrades.upgradeProxy(erc20Gateway, V2Implementation);

  //   // Check functions that only exist in v2
  //   expect(
  //     await erc20Gateway.isBridge(randomBytes32(), randomAddress())
  //   ).to.be.equal(false);
  // });

  // describe('deposit()', () => {
  //   it('reverts if target fuel bridge has not been initialized', async () => {
  //     const { token, signers, erc20Gateway } = env;

  //     const [, user] = signers;
  //     const { HashZero, MaxUint256 } = constants;

  //     const depositTx = erc20Gateway
  //       .connect(user)
  //       .deposit(HashZero, token.address, HashZero, MaxUint256);

  //     await expect(depositTx).to.be.revertedWithCustomError(
  //       erc20Gateway,
  //       'FuelContractIsNotBridge'
  //     );
  //   });

  //   it('works if target fuel bridge has been initialized', async () => {
  //     const { token, signers, erc20Gateway, fuelMessagePortal } = env;
  //     const [, user] = signers;

  //     const depositAmount = 100;
  //     await token.mint(user.address, depositAmount);
  //     await token
  //       .connect(user)
  //       .approve(erc20Gateway.address, constants.MaxUint256);

  //     const fuelBridge = randomBytes32();
  //     const fuelRecipient = randomBytes32();
  //     const sender = hexZeroPad(user.address.toLowerCase(), 32);

  //     await fuelMessagePortal.setMessageSender(fuelBridge);
  //     const impersonatedPortal = await impersonateAccount(
  //       fuelMessagePortal.address,
  //       hre
  //     );

  //     const registerTx = await erc20Gateway
  //       .connect(impersonatedPortal)
  //       .registerAsReceiver(token.address);

  //     await expect(registerTx).to.emit(erc20Gateway, 'ReceiverRegistered');

  //     const depositTx = await erc20Gateway
  //       .connect(user)
  //       .deposit(fuelRecipient, token.address, fuelBridge, depositAmount);

  //     await expect(depositTx)
  //       .to.emit(erc20Gateway, 'Deposit')
  //       .withArgs(sender, token.address, fuelBridge, depositAmount);
  //   });
  // });
});
