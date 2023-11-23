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

      it('reverts if deposited amount is over the global limit', async () => {
        const {
          token: _token,
          erc20Gateway,
          signers: [deployer, user],
        } = env;
        const token = _token.connect(user);

        const amount = utils.parseEther(Math.random().toFixed(2));
        const recipient = randomBytes32();
        const fuelBridge = randomBytes32();

        await token.mint(user.address, amount);
        await token.approve(erc20Gateway.address, constants.MaxUint256);

        await erc20Gateway
          .connect(deployer)
          .setGlobalDepositLimit(token.address, amount.sub(1));

        const depositTx = erc20Gateway
          .connect(user)
          .deposit(recipient, token.address, fuelBridge, amount);

        await expect(depositTx).to.be.revertedWithCustomError(
          erc20Gateway,
          'GlobalDepositLimit'
        );
      });

      it('works if deposited amount is equal the global limit', async () => {
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

        await erc20Gateway
          .connect(deployer)
          .setGlobalDepositLimit(token.address, amount);

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

        const expectedMessageData = encodeErc20DepositMessage(
          fuelBridge,
          token,
          user,
          recipient,
          amount
        );
        const logs = await fuelMessagePortal.queryFilter(
          fuelMessagePortal.filters.SendMessageCalled(
            CONTRACT_MESSAGE_PREDICATE,
            null
          ),
          await depositTx
            .then((tx) => tx.wait())
            .then((receipt) => receipt.blockHash)
        );

        expect(logs).to.have.length(1);
        expect(logs[0].args.data).to.be.equal(expectedMessageData);
      });

      it('allows to deposit tokens with data', async () => {
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

        const expectedMessageData = encodeErc20DepositMessage(
          fuelBridge,
          token,
          user,
          recipient,
          amount,
          depositData
        );
        const logs = await fuelMessagePortal.queryFilter(
          fuelMessagePortal.filters.SendMessageCalled(
            CONTRACT_MESSAGE_PREDICATE,
            null
          ),
          await depositTx
            .then((tx) => tx.wait())
            .then((receipt) => receipt.blockHash)
        );

        expect(logs).to.have.length(1);
        expect(logs[0].args.data).to.be.equal(expectedMessageData);
      });

      it('allows to deposit tokens with empty data', async () => {
        const {
          token: _token,
          erc20Gateway,
          fuelMessagePortal,
          signers: [deployer, user],
        } = env;
        const token = _token.connect(user);

        const amount = utils.parseEther(Math.random().toFixed(2));
        const depositData = [];
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

        const expectedMessageData = encodeErc20DepositMessage(
          fuelBridge,
          token,
          user,
          recipient,
          amount,
          depositData
        );
        const logs = await fuelMessagePortal.queryFilter(
          fuelMessagePortal.filters.SendMessageCalled(
            CONTRACT_MESSAGE_PREDICATE,
            null
          ),
          await depositTx
            .then((tx) => tx.wait())
            .then((receipt) => receipt.blockHash)
        );

        expect(logs).to.have.length(1);
        expect(logs[0].args.data).to.be.equal(expectedMessageData);
      });

      describe.only('when there is a previous existing deposit', async () => {
        let fuelBridge1: string;
        let fuelBridge2: string;
        let preExistingAmount: BigNumber;

        beforeEach('make a deposit', async () => {
          const {
            token: _token,
            erc20Gateway,
            fuelMessagePortal,
            signers: [deployer, ...signers],
          } = env;

          fuelBridge1 = randomBytes32();
          fuelBridge2 = randomBytes32();

          const [user] = signers;
          const token = _token.connect(user);
          preExistingAmount = utils.parseEther(Math.random().toFixed(2));
          const recipient = randomBytes32();
          const fuelBridge = fuelBridge1;

          await fuelMessagePortal
            .connect(deployer)
            .setMessageSender(fuelBridge1);
          const impersonatedPortal = await impersonateAccount(
            fuelMessagePortal.address,
            hre
          );
          await erc20Gateway
            .connect(impersonatedPortal)
            .registerAsReceiver(token.address);

          await fuelMessagePortal
            .connect(deployer)
            .setMessageSender(fuelBridge2);
          await erc20Gateway
            .connect(impersonatedPortal)
            .registerAsReceiver(token.address);

          await token.mint(user.address, preExistingAmount);
          await token.approve(erc20Gateway.address, constants.MaxUint256);

          await erc20Gateway
            .connect(user)
            .deposit(recipient, token.address, fuelBridge, preExistingAmount);
        });

        it('correctly updates global deposits', async () => {
          const {
            token: _token,
            erc20Gateway,
            fuelMessagePortal,
            signers: [deployer, ...signers],
          } = env;

          const [user] = signers;
          const token = _token.connect(user);
          const amount = utils.parseEther(Math.random().toFixed(2));
          const recipient = randomBytes32();
          const fuelBridge = fuelBridge1;

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

          const expectedMessageData = encodeErc20DepositMessage(
            fuelBridge,
            token,
            user,
            recipient,
            amount
          );
          const logs = await fuelMessagePortal.queryFilter(
            fuelMessagePortal.filters.SendMessageCalled(
              CONTRACT_MESSAGE_PREDICATE,
              null
            ),
            await depositTx
              .then((tx) => tx.wait())
              .then((receipt) => receipt.blockHash)
          );

          expect(logs).to.have.length(1);
          expect(logs[0].args.data).to.be.equal(expectedMessageData);

          const actualDepositTotals = await erc20Gateway.depositTotals(
            token.address
          );
          const expectedDepositTotals = amount.add(preExistingAmount);

          expect(actualDepositTotals).to.be.equal(expectedDepositTotals);
        });

        it('correctly updates deposits of the fuel side contract', async () => {
          const {
            token: _token,
            erc20Gateway,
            fuelMessagePortal,
            signers: [deployer, ...signers],
          } = env;

          const [user] = signers;
          const token = _token.connect(user);
          const amount = utils.parseEther(Math.random().toFixed(2));
          const recipient = randomBytes32();
          const fuelBridge = fuelBridge1;

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

          const expectedMessageData = encodeErc20DepositMessage(
            fuelBridge,
            token,
            user,
            recipient,
            amount
          );
          const logs = await fuelMessagePortal.queryFilter(
            fuelMessagePortal.filters.SendMessageCalled(
              CONTRACT_MESSAGE_PREDICATE,
              null
            ),
            await depositTx
              .then((tx) => tx.wait())
              .then((receipt) => receipt.blockHash)
          );

          expect(logs).to.have.length(1);
          expect(logs[0].args.data).to.be.equal(expectedMessageData);

          const actualTokenDeposits = await erc20Gateway.tokensDeposited(
            token.address,
            fuelBridge
          );
          const expectedTokenDeposits = amount.add(preExistingAmount);

          expect(actualTokenDeposits).to.be.equal(expectedTokenDeposits);
        });

        it('correctly updates deposits of different fuel side contracts', async () => {
          const {
            token: _token,
            erc20Gateway,
            fuelMessagePortal,
            signers: [deployer, ...signers],
          } = env;

          const [user] = signers;
          const token = _token.connect(user);
          const amount = utils.parseEther(Math.random().toFixed(2));
          const recipient = randomBytes32();
          const fuelBridge = fuelBridge2;

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

          const expectedMessageData = encodeErc20DepositMessage(
            fuelBridge,
            token,
            user,
            recipient,
            amount
          );
          const logs = await fuelMessagePortal.queryFilter(
            fuelMessagePortal.filters.SendMessageCalled(
              CONTRACT_MESSAGE_PREDICATE,
              null
            ),
            await depositTx
              .then((tx) => tx.wait())
              .then((receipt) => receipt.blockHash)
          );

          expect(logs).to.have.length(1);
          expect(logs[0].args.data).to.be.equal(expectedMessageData);

          const actualTokenDeposits = await erc20Gateway.tokensDeposited(
            token.address,
            fuelBridge2
          );

          expect(actualTokenDeposits).to.be.equal(amount);
        });
      });
    });

    describe('finalizeWithdrawal', () => {
      it('reduces the deposited balances');
      it('nullifies the deposited address');
      it('reverts if withdrawn amount is 0');
      it('reverts if tokenId is not 0');
    });
  });
}
