import { hexZeroPad } from '@ethersproject/bytes';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { utils, constants, type ContractFactory, BigNumber } from 'ethers';
import hre from 'hardhat';

import { CONTRACT_MESSAGE_PREDICATE } from '../../protocol/constants';
import { randomAddress, randomBytes32 } from '../../protocol/utils';
import {
  type MockFuelMessagePortal,
  type FuelERC20GatewayV3,
  type Token,
  FuelERC20GatewayV3__factory,
} from '../../typechain';
import { encodeErc20DepositMessage, impersonateAccount } from '../utils';

type Env = {
  fuelMessagePortal: MockFuelMessagePortal;
  erc20Gateway: FuelERC20GatewayV3;
  V2Implementation: ContractFactory;
  token: Token;
  signers: SignerWithAddress[];
  deployer: SignerWithAddress;
};

export function behavesLikeErc20GatewayV3(fixture: () => Promise<Env>) {
  describe('Behaves like FuelERC20GatewayV3', () => {
    let env: Env;

    before('fixture', async () => {
      env = await fixture();
    });

    it('can upgrade from V2', async () => {
      const [deployer] = await hre.ethers.getSigners();
      const fuelMessagePortal = randomAddress();

      const erc20Gateway = await hre.ethers
        .getContractFactory('FuelERC20GatewayV2')
        .then((factory) =>
          hre.upgrades.deployProxy(factory, [fuelMessagePortal], {
            initializer: 'initialize',
          })
        )
        .then(({ address }) =>
          FuelERC20GatewayV3__factory.connect(address, deployer)
        );

      // Check that functions that only exist on V3 do revert
      await expect(erc20Gateway.depositLimitGlobal(randomAddress())).to.be
        .reverted;

      const V3Implementation = await hre.ethers.getContractFactory(
        'FuelERC20GatewayV3'
      );
      await hre.upgrades.upgradeProxy(erc20Gateway, V3Implementation);

      // Check functions that exist in v3 now do return a value
      expect(
        await erc20Gateway.depositLimitGlobal(randomAddress())
      ).to.be.equal(0);
    });

    describe('deposit()', () => {
      beforeEach('reset fixture', async () => {
        env = await fixture();
      });

      it('reverts if deposited amount is 0', async () => {
        const {
          token: _token,
          erc20Gateway,
          signers: [, user],
        } = env;
        const token = _token.connect(user);

        const amount = BigNumber.from(0);
        const recipient = randomBytes32();
        const fuelBridge = randomBytes32();

        await token.mint(user.address, amount);
        await token.approve(erc20Gateway.address, constants.MaxUint256);

        const depositTx = erc20Gateway
          .connect(user)
          .deposit(recipient, token.address, fuelBridge, amount);

        await expect(depositTx).to.be.revertedWithCustomError(
          erc20Gateway,
          'CannotDepositZero'
        );
      });

      it.only('works if deposited amount is equal the global limit', async () => {
        const {
          token: _token,
          erc20Gateway,
          fuelMessagePortal,
          signers: [deployer, user],
        } = env;
        const token = _token.connect(user);

        const amount = utils.parseEther(Math.random().toFixed(2));
        const recipient = randomBytes32();
        const fuelBridge = randomBytes32();

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);
        const impersonatedPortal = await impersonateAccount(
          fuelMessagePortal.address,
          hre
        );
        await erc20Gateway
          .connect(impersonatedPortal)
          .registerAsReceiver(token.address);

        await token.mint(user.address, amount);
        await token.approve(erc20Gateway.address, constants.MaxUint256);

        const depositTx = erc20Gateway
          .connect(user)
          .deposit(recipient, token.address, fuelBridge, amount);

        await expect(depositTx).to.changeTokenBalances(
          token,
          [user.address, erc20Gateway.address],
          [amount.mul(-1), amount]
        );

        await expect(depositTx)
          .to.emit(erc20Gateway, 'Deposit')
          .withArgs(
            hexZeroPad(user.address, 32).toLowerCase(),
            token.address,
            fuelBridge,
            amount
          );

        const logs = fuelMessagePortal.queryFilter(
          fuelMessagePortal.filters.SendMessageCalled(fuelBridge, null)
        );
        console.log(logs);
        console.log(
          encodeErc20DepositMessage(fuelBridge, token, user, recipient, amount)
        );
        // const logs = await depositTx
        //   .then((tx) => tx.wait())
        //   .then(({ logs }) =>
        //     logs.filter(
        //       (log) =>
        //         log.topics[0] ===
        //         fuelMessagePortal.filters.SendMessageCalled(null, null)
        //           .topics[0]
        //     )
        //   );

        // expect(logs.length).to.be.equal(1);
        // const [log] =
        // expect(SendMessageCalledLog.)
      });

      it.skip('allows to deposit tokens with data', async () => {
        const {
          token: _token,
          erc20Gateway,
          fuelMessagePortal,
          signers: [deployer, user],
        } = env;
        const token = _token.connect(user);

        const amount = utils.parseEther(Math.random().toFixed(2));
        const depositData = [0, 1, 2, 3, 4];
        const recipient = randomBytes32();
        const fuelBridge = randomBytes32();

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);
        const impersonatedPortal = await impersonateAccount(
          fuelMessagePortal.address,
          hre
        );
        await erc20Gateway
          .connect(impersonatedPortal)
          .registerAsReceiver(token.address);

        await token.mint(user.address, amount);
        await token.approve(erc20Gateway.address, constants.MaxUint256);

        const depositTx = erc20Gateway
          .connect(user)
          .depositWithData(
            recipient,
            token.address,
            fuelBridge,
            amount,
            depositData
          );

        await expect(depositTx).to.changeTokenBalances(
          token,
          [user.address, erc20Gateway.address],
          [amount.mul(-1), amount]
        );

        await expect(depositTx)
          .to.emit(erc20Gateway, 'Deposit')
          .withArgs(
            hexZeroPad(user.address, 32).toLowerCase(),
            token.address,
            fuelBridge,
            amount
          );

        await expect(depositTx)
          .to.emit(fuelMessagePortal, 'SendMessageCalled')
          .withArgs(fuelBridge, []);
      });
      it('allows to deposit tokens with empty data');
      it('reverts if deposited amount is over the global limit');
    });

    describe('finalizeWithdrawal', () => {
      it('reduces the deposited balances');
      it('nullifies the deposited address');
      it('reverts if withdrawn amount is 0');
      it('reverts if tokenId is not 0');
    });
  });
}
