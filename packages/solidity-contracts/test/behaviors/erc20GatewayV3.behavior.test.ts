import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import {
  MaxUint256,
  type ContractFactory,
  parseEther,
  zeroPadValue,
} from 'ethers';
import hre from 'hardhat';
import { random } from 'lodash';

import { CONTRACT_MESSAGE_PREDICATE } from '../../protocol/constants';
import { randomAddress, randomBytes32 } from '../../protocol/utils';
import {
  type MockFuelMessagePortal,
  type FuelERC20GatewayV3,
  type Token,
  FuelERC20GatewayV3__factory,
} from '../../typechain';
import { encodeErc20DepositMessage } from '../utils';
import { impersonateAccount } from '../utils/impersonateAccount';

type Env = {
  fuelMessagePortal: MockFuelMessagePortal;
  erc20Gateway: FuelERC20GatewayV3;
  V2Implementation: ContractFactory;
  token: Token;
  signers: HardhatEthersSigner[];
  deployer: HardhatEthersSigner;
};

const TOKEN_ID = 0;
const UNDERFLOW_PANIC_CODE = '0x11';

export function behavesLikeErc20GatewayV3(fixture: () => Promise<Env>) {
  describe('Behaves like FuelERC20GatewayV3', () => {
    let env: Env;

    beforeEach('reset fixture', async () => {
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
        .then((tx) => FuelERC20GatewayV3__factory.connect(tx as any, deployer));

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

    describe('setGlobalDepositLimit()', () => {
      it('reverts when called by an unauthorized address', async () => {
        const {
          erc20Gateway,
          token,
          signers: [, mallory],
        } = env;

        const tx = erc20Gateway
          .connect(mallory)
          .setGlobalDepositLimit(token, MaxUint256);

        const expectedErrorMsg =
          `AccessControl: account ${(
            await mallory.getAddress()
          ).toLowerCase()} ` +
          'is missing role 0x0000000000000000000000000000000000000000000000000000000000000000';
        await expect(tx).to.be.revertedWith(expectedErrorMsg);
      });
    });

    describe('deposit()', () => {
      it('reverts if deposited amount is 0', async () => {
        const {
          token: _token,
          erc20Gateway,
          signers: [, user],
        } = env;
        const token = _token.connect(user);

        const amount = BigInt(0);
        const recipient = randomBytes32();
        const fuelBridge = randomBytes32();

        await token.mint(user, amount);
        await token.approve(erc20Gateway, MaxUint256);

        const depositTx = erc20Gateway
          .connect(user)
          .deposit(recipient, token, fuelBridge, amount);

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

        const amount = parseEther(random(0.01, 1, true).toFixed(2));
        const recipient = randomBytes32();
        const fuelBridge = randomBytes32();

        await token.mint(user, amount);
        await token.approve(erc20Gateway, MaxUint256);

        await erc20Gateway
          .connect(deployer)
          .setGlobalDepositLimit(token, amount - 1n);

        const depositTx = erc20Gateway
          .connect(user)
          .deposit(recipient, token, fuelBridge, amount);

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

        const amount = parseEther(random(0.01, 1, true).toFixed(2));
        const recipient = randomBytes32();
        const fuelBridge = randomBytes32();

        await erc20Gateway
          .connect(deployer)
          .setGlobalDepositLimit(token, amount);

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);
        const impersonatedPortal = await impersonateAccount(
          fuelMessagePortal,
          hre
        );
        await erc20Gateway
          .connect(impersonatedPortal)
          .registerAsReceiver(token);

        await token.mint(user, amount);
        await token.approve(erc20Gateway, MaxUint256);

        const depositTx = erc20Gateway
          .connect(user)
          .deposit(recipient, token, fuelBridge, amount);

        await expect(depositTx).to.changeTokenBalances(
          token,
          [user, erc20Gateway],
          [amount * -1n, amount]
        );

        await expect(depositTx)
          .to.emit(erc20Gateway, 'Deposit')
          .withArgs(
            zeroPadValue(await user.getAddress(), 32).toLowerCase(),
            token,
            fuelBridge,
            amount
          );

        const expectedMessageData = encodeErc20DepositMessage(
          fuelBridge,
          await token.getAddress(),
          user,
          recipient,
          amount
        );
        const logs = await fuelMessagePortal.queryFilter(
          fuelMessagePortal.filters.SendMessageCalled(
            CONTRACT_MESSAGE_PREDICATE,
            null
          ),
          await depositTx.then((tx) => tx.blockNumber)
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

        const amount = parseEther(random(0.01, 1, true).toFixed(2));
        const depositData = new Uint8Array([0, 1, 2, 3, 4]);
        const recipient = randomBytes32();
        const fuelBridge = randomBytes32();

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);
        const impersonatedPortal = await impersonateAccount(
          fuelMessagePortal,
          hre
        );
        await erc20Gateway
          .connect(impersonatedPortal)
          .registerAsReceiver(token);

        await token.mint(user, amount);
        await token.approve(erc20Gateway, MaxUint256);

        const depositTx = erc20Gateway
          .connect(user)
          .depositWithData(recipient, token, fuelBridge, amount, depositData);

        await expect(depositTx).to.changeTokenBalances(
          token,
          [user, erc20Gateway],
          [amount * -1n, amount]
        );

        await expect(depositTx)
          .to.emit(erc20Gateway, 'Deposit')
          .withArgs(
            zeroPadValue(await user.getAddress(), 32).toLowerCase(),
            token,
            fuelBridge,
            amount
          );

        const expectedMessageData = encodeErc20DepositMessage(
          fuelBridge,
          await token.getAddress(),
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
          await depositTx.then((tx) => tx.blockNumber)
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

        const amount = parseEther(random(0.01, 1, true).toFixed(2));
        const depositData = new Uint8Array([]);
        const recipient = randomBytes32();
        const fuelBridge = randomBytes32();

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);
        const impersonatedPortal = await impersonateAccount(
          fuelMessagePortal,
          hre
        );
        await erc20Gateway
          .connect(impersonatedPortal)
          .registerAsReceiver(token);

        await token.mint(user, amount);
        await token.approve(erc20Gateway, MaxUint256);

        const depositTx = erc20Gateway
          .connect(user)
          .depositWithData(recipient, token, fuelBridge, amount, depositData);

        await expect(depositTx).to.changeTokenBalances(
          token,
          [user, erc20Gateway],
          [amount * -1n, amount]
        );

        await expect(depositTx)
          .to.emit(erc20Gateway, 'Deposit')
          .withArgs(
            zeroPadValue(await user.getAddress(), 32).toLowerCase(),
            token,
            fuelBridge,
            amount
          );

        const expectedMessageData = encodeErc20DepositMessage(
          fuelBridge,
          await token.getAddress(),
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
          await depositTx.then((tx) => tx.blockNumber)
        );

        expect(logs).to.have.length(1);
        expect(logs[0].args.data).to.be.equal(expectedMessageData);
      });

      describe('when there is a previous existing deposit', async () => {
        let fuelBridge1: string;
        let fuelBridge2: string;
        let preExistingAmount: bigint;

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
          preExistingAmount = parseEther(random(0.01, 1, true).toFixed(2));
          const recipient = randomBytes32();
          const fuelBridge = fuelBridge1;

          await fuelMessagePortal
            .connect(deployer)
            .setMessageSender(fuelBridge1);
          const impersonatedPortal = await impersonateAccount(
            fuelMessagePortal,
            hre
          );
          await erc20Gateway
            .connect(impersonatedPortal)
            .registerAsReceiver(token);

          await fuelMessagePortal
            .connect(deployer)
            .setMessageSender(fuelBridge2);
          await erc20Gateway
            .connect(impersonatedPortal)
            .registerAsReceiver(token);

          await token.mint(user, preExistingAmount);
          await token.approve(erc20Gateway, MaxUint256);

          await erc20Gateway
            .connect(user)
            .deposit(recipient, token, fuelBridge, preExistingAmount);
        });

        it('correctly updates global deposits', async () => {
          const {
            token: _token,
            erc20Gateway,
            fuelMessagePortal,
            signers: [, ...signers],
          } = env;

          const [user] = signers;
          const token = _token.connect(user);
          const amount = parseEther(random(0.01, 1, true).toFixed(2));
          const recipient = randomBytes32();
          const fuelBridge = fuelBridge1;

          await token.mint(user, amount);
          await token.approve(erc20Gateway, MaxUint256);

          const depositTx = erc20Gateway
            .connect(user)
            .deposit(recipient, token, fuelBridge, amount);

          await expect(depositTx).to.changeTokenBalances(
            token,
            [user, erc20Gateway],
            [amount * -1n, amount]
          );

          await expect(depositTx)
            .to.emit(erc20Gateway, 'Deposit')
            .withArgs(
              zeroPadValue(await user.getAddress(), 32).toLowerCase(),
              token,
              fuelBridge,
              amount
            );

          const expectedMessageData = encodeErc20DepositMessage(
            fuelBridge,
            await token.getAddress(),
            user,
            recipient,
            amount
          );
          const logs = await fuelMessagePortal.queryFilter(
            fuelMessagePortal.filters.SendMessageCalled(
              CONTRACT_MESSAGE_PREDICATE,
              null
            ),
            await depositTx.then((tx) => tx.blockNumber)
          );

          expect(logs).to.have.length(1);
          expect(logs[0].args.data).to.be.equal(expectedMessageData);

          const actualDepositTotals = await erc20Gateway.depositTotals(token);
          const expectedDepositTotals = amount + preExistingAmount;

          expect(actualDepositTotals).to.be.equal(expectedDepositTotals);
        });

        it('correctly updates deposits of the fuel side contract', async () => {
          const {
            token: _token,
            erc20Gateway,
            fuelMessagePortal,
            signers: [, ...signers],
          } = env;

          const [user] = signers;
          const token = _token.connect(user);
          const amount = parseEther(random(0.01, 1, true).toFixed(2));
          const recipient = randomBytes32();
          const fuelBridge = fuelBridge1;

          await token.mint(user, amount);
          await token.approve(erc20Gateway, MaxUint256);

          const depositTx = erc20Gateway
            .connect(user)
            .deposit(recipient, token, fuelBridge, amount);

          await expect(depositTx).to.changeTokenBalances(
            token,
            [user, erc20Gateway],
            [amount * -1n, amount]
          );

          await expect(depositTx)
            .to.emit(erc20Gateway, 'Deposit')
            .withArgs(
              zeroPadValue(await user.getAddress(), 32).toLowerCase(),
              token,
              fuelBridge,
              amount
            );

          const expectedMessageData = encodeErc20DepositMessage(
            fuelBridge,
            await token.getAddress(),
            user,
            recipient,
            amount
          );
          const logs = await fuelMessagePortal.queryFilter(
            fuelMessagePortal.filters.SendMessageCalled(
              CONTRACT_MESSAGE_PREDICATE,
              null
            ),
            await depositTx.then((tx) => tx.blockNumber)
          );

          expect(logs).to.have.length(1);
          expect(logs[0].args.data).to.be.equal(expectedMessageData);

          const actualTokenDeposits = await erc20Gateway.tokensDeposited(
            token,
            fuelBridge
          );
          const expectedTokenDeposits = amount + preExistingAmount;

          expect(actualTokenDeposits).to.be.equal(expectedTokenDeposits);
        });

        it('correctly updates deposits of different fuel side contracts', async () => {
          const {
            token: _token,
            erc20Gateway,
            fuelMessagePortal,
            signers: [, ...signers],
          } = env;

          const [user] = signers;
          const token = _token.connect(user);
          const amount = parseEther(random(0.01, 1, true).toFixed(2));
          const recipient = randomBytes32();
          const fuelBridge = fuelBridge2;

          await token.mint(user, amount);
          await token.approve(erc20Gateway, MaxUint256);

          const depositTx = erc20Gateway
            .connect(user)
            .deposit(recipient, token, fuelBridge, amount);

          await expect(depositTx).to.changeTokenBalances(
            token,
            [user, erc20Gateway],
            [amount * -1n, amount]
          );

          await expect(depositTx)
            .to.emit(erc20Gateway, 'Deposit')
            .withArgs(
              zeroPadValue(await user.getAddress(), 32).toLowerCase(),
              token,
              fuelBridge,
              amount
            );

          const expectedMessageData = encodeErc20DepositMessage(
            fuelBridge,
            await token.getAddress(),
            user,
            recipient,
            amount
          );
          const logs = await fuelMessagePortal.queryFilter(
            fuelMessagePortal.filters.SendMessageCalled(
              CONTRACT_MESSAGE_PREDICATE,
              null
            ),
            await depositTx.then((tx) => tx.blockNumber)
          );

          expect(logs).to.have.length(1);
          expect(logs[0].args.data).to.be.equal(expectedMessageData);

          const actualTokenDeposits = await erc20Gateway.tokensDeposited(
            token,
            fuelBridge2
          );

          expect(actualTokenDeposits).to.be.equal(amount);
        });
      });
    });

    describe('finalizeWithdrawal', () => {
      const deposit = async () => {
        const {
          token: _token,
          erc20Gateway,
          fuelMessagePortal,
          signers: [deployer, user],
        } = env;
        const token = _token.connect(user);

        const amount = parseEther(random(0.01, 1, true).toFixed(2));
        const recipient = randomBytes32();
        const fuelBridge = randomBytes32();

        await erc20Gateway
          .connect(deployer)
          .setGlobalDepositLimit(token, amount);

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);
        const impersonatedPortal = await impersonateAccount(
          fuelMessagePortal,
          hre
        );
        await erc20Gateway
          .connect(impersonatedPortal)
          .registerAsReceiver(token);

        await token.mint(user, amount);
        await token.approve(erc20Gateway, MaxUint256);

        await erc20Gateway
          .connect(user)
          .deposit(recipient, token, fuelBridge, amount);

        return { amount, recipient, fuelBridge, impersonatedPortal };
      };

      it('can withdraw several times and reduces deposited balances', async () => {
        const { amount, impersonatedPortal, fuelBridge } = await deposit();
        const withdrawAmount = amount / 4n;

        const {
          token,
          fuelMessagePortal,
          erc20Gateway,
          signers: [deployer],
        } = env;

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);

        // Withdrawal 1
        {
          const recipient = randomAddress();
          const withdrawalTx = erc20Gateway
            .connect(impersonatedPortal)
            .finalizeWithdrawal(recipient, token, withdrawAmount, TOKEN_ID);

          await withdrawalTx;

          const expectedTokenTotals = amount - withdrawAmount;
          expect(
            await erc20Gateway.tokensDeposited(token, fuelBridge)
          ).to.be.equal(expectedTokenTotals);
          expect(await erc20Gateway.depositTotals(token)).to.be.equal(
            expectedTokenTotals
          );

          await expect(withdrawalTx).to.changeTokenBalances(
            token,
            [erc20Gateway, recipient],
            [withdrawAmount * -1n, withdrawAmount]
          );
          await expect(withdrawalTx)
            .to.emit(erc20Gateway, 'Withdrawal')
            .withArgs(
              zeroPadValue(recipient, 32).toLowerCase(),
              token,
              fuelBridge,
              withdrawAmount
            );
        }

        // Withdrawal 2
        {
          const recipient = randomAddress();
          const withdrawalTx = erc20Gateway
            .connect(impersonatedPortal)
            .finalizeWithdrawal(recipient, token, withdrawAmount, TOKEN_ID);

          await withdrawalTx;

          const expectedTokenTotals = amount - withdrawAmount * 2n;

          expect(
            await erc20Gateway.tokensDeposited(token, fuelBridge)
          ).to.be.equal(expectedTokenTotals);
          expect(await erc20Gateway.depositTotals(token)).to.be.equal(
            expectedTokenTotals
          );

          await expect(withdrawalTx).to.changeTokenBalances(
            token,
            [erc20Gateway, recipient],
            [withdrawAmount * -1n, withdrawAmount]
          );
          await expect(withdrawalTx)
            .to.emit(erc20Gateway, 'Withdrawal')
            .withArgs(
              zeroPadValue(recipient, 32).toLowerCase(),
              token,
              fuelBridge,
              withdrawAmount
            );
        }
      });

      it('reverts if withdrawn amount is 0', async () => {
        const { impersonatedPortal, fuelBridge } = await deposit();
        const withdrawAmount = 0;

        const {
          token,
          fuelMessagePortal,
          erc20Gateway,
          signers: [deployer],
        } = env;

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);

        const recipient = randomAddress();
        const withdrawalTx = erc20Gateway
          .connect(impersonatedPortal)
          .finalizeWithdrawal(recipient, token, withdrawAmount, TOKEN_ID);

        await expect(withdrawalTx).to.be.revertedWithCustomError(
          erc20Gateway,
          'CannotWithdrawZero'
        );
      });

      it('reverts if tokenId is not 0', async () => {
        const { amount, impersonatedPortal, fuelBridge } = await deposit();
        const withdrawAmount = amount;

        const {
          token,
          fuelMessagePortal,
          erc20Gateway,
          signers: [deployer],
        } = env;

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);

        const recipient = randomAddress();
        const withdrawalTx = erc20Gateway
          .connect(impersonatedPortal)
          .finalizeWithdrawal(recipient, token, withdrawAmount, TOKEN_ID + 1);

        await expect(withdrawalTx).to.be.revertedWithCustomError(
          erc20Gateway,
          'TokenIdNotAllowed'
        );
      });

      it('reverts if trying to withdraw more than initially deposited', async () => {
        const { amount, impersonatedPortal, fuelBridge } = await deposit();
        const withdrawAmount = amount + 1n;

        const {
          token,
          fuelMessagePortal,
          erc20Gateway,
          signers: [deployer],
        } = env;

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);

        const recipient = randomAddress();
        const withdrawalTx = erc20Gateway
          .connect(impersonatedPortal)
          .finalizeWithdrawal(recipient, token, withdrawAmount, TOKEN_ID);

        await expect(withdrawalTx).to.be.revertedWithPanic(
          UNDERFLOW_PANIC_CODE
        );
      });

      it('reverts when paused', async () => {
        const { amount, impersonatedPortal, fuelBridge } = await deposit();
        const withdrawAmount = amount;

        const {
          token,
          fuelMessagePortal,
          erc20Gateway,
          signers: [deployer],
        } = env;

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);

        const recipient = randomAddress();
        await erc20Gateway.connect(deployer).pause();

        const withdrawalTx = erc20Gateway
          .connect(impersonatedPortal)
          .finalizeWithdrawal(recipient, token, withdrawAmount, TOKEN_ID);

        await expect(withdrawalTx).to.be.revertedWith('Pausable: paused');
      });

      it('reverts when called by an unauthorized address', async () => {
        const { amount, fuelBridge } = await deposit();
        const withdrawAmount = amount;

        const {
          token,
          fuelMessagePortal,
          erc20Gateway,
          signers: [deployer, mallory],
        } = env;

        await fuelMessagePortal.connect(deployer).setMessageSender(fuelBridge);

        const recipient = randomAddress();

        const withdrawalTx = erc20Gateway
          .connect(mallory)
          .finalizeWithdrawal(recipient, token, withdrawAmount, TOKEN_ID);

        await expect(withdrawalTx).to.be.revertedWithCustomError(
          erc20Gateway,
          'CallerIsNotPortal'
        );
      });
    });
  });
}
