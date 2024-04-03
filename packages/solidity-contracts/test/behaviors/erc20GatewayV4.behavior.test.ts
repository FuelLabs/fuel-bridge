import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import {
  MaxUint256,
  ZeroHash,
  keccak256,
  parseEther,
  solidityPacked,
  toUtf8Bytes,
  zeroPadValue,
} from 'ethers';
import type { BytesLike } from 'ethers';
import hre from 'hardhat';
import { random } from 'lodash';

import { CONTRACT_MESSAGE_PREDICATE } from '../../protocol/constants';
import { randomAddress, randomBytes32 } from '../../protocol/utils';
import {
  type MockFuelMessagePortal,
  type FuelERC20GatewayV4,
  type Token,
} from '../../typechain';
import { impersonateAccount } from '../utils/impersonateAccount';

type Env = {
  fuelMessagePortal: MockFuelMessagePortal;
  assetIssuerId: BytesLike;
  erc20Gateway: FuelERC20GatewayV4;
  token: Token;
  signers: HardhatEthersSigner[];
  deployer: HardhatEthersSigner;
};

const TOKEN_ID = 0;
const UNDERFLOW_PANIC_CODE = '0x11';
const DEPOSIT_TO_CONTRACT_FLAG = keccak256(
  toUtf8Bytes('DEPOSIT_TO_CONTRACT')
).substring(0, 4);

export function behavesLikeErc20GatewayV4(fixture: () => Promise<Env>) {
  describe('Behaves like FuelERC20GatewayV4', () => {
    let env: Env;

    beforeEach('reset fixture', async () => {
      env = await fixture();
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

        await token.mint(user, amount);
        await token.approve(erc20Gateway, MaxUint256);

        const depositTx = erc20Gateway
          .connect(user)
          .deposit(recipient, token, amount);

        await expect(depositTx).to.be.revertedWithCustomError(
          erc20Gateway,
          'CannotDepositZero'
        );
      });

      it('allows to deposit tokens with data', async () => {
        const {
          token: _token,
          erc20Gateway,
          fuelMessagePortal,
          assetIssuerId,
          signers: [deployer, user],
        } = env;
        const token = _token.connect(user);

        const amount = parseEther(random(0.01, 1, true).toFixed(2));
        const depositData = new Uint8Array([0, 1, 2, 3, 4]);
        const recipient = randomBytes32();

        await fuelMessagePortal
          .connect(deployer)
          .setMessageSender(env.assetIssuerId);

        await token.mint(user, amount);
        await token.approve(erc20Gateway, MaxUint256);

        const depositTx = erc20Gateway
          .connect(user)
          .depositWithData(recipient, token, amount, depositData);

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
            amount
          );

        const expectedMessageData = solidityPacked(
          [
            'uint8',
            'bytes32',
            'bytes32',
            'bytes32',
            'bytes32',
            'bytes32',
            'uint256',
            'uint8',
            'bytes1',
            'bytes',
          ],
          [
            0,
            assetIssuerId,
            zeroPadValue(await token.getAddress(), 32),
            ZeroHash,
            zeroPadValue(user.address, 32),
            recipient,
            amount,
            await token.decimals(),
            DEPOSIT_TO_CONTRACT_FLAG,
            depositData,
          ]
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
          assetIssuerId,
          signers: [deployer, user],
        } = env;
        const token = _token.connect(user);

        const amount = parseEther(random(0.01, 1, true).toFixed(2));
        const depositData = new Uint8Array([]);
        const recipient = randomBytes32();

        await fuelMessagePortal
          .connect(deployer)
          .setMessageSender(env.assetIssuerId);

        await token.mint(user, amount);
        await token.approve(erc20Gateway, MaxUint256);

        const depositTx = erc20Gateway
          .connect(user)
          .depositWithData(recipient, token, amount, depositData);

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
            amount
          );

        const expectedMessageData = solidityPacked(
          [
            'uint8',
            'bytes32',
            'bytes32',
            'bytes32',
            'bytes32',
            'bytes32',
            'uint256',
            'uint8',
            'bytes1',
            'bytes',
          ],
          [
            0,
            assetIssuerId,
            zeroPadValue(await token.getAddress(), 32),
            ZeroHash,
            zeroPadValue(user.address, 32),
            recipient,
            amount,
            await token.decimals(),
            DEPOSIT_TO_CONTRACT_FLAG,
            depositData,
          ]
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
        let preExistingAmount: bigint;

        beforeEach('make a deposit', async () => {
          const {
            token: _token,
            erc20Gateway,
            fuelMessagePortal,
            assetIssuerId,
            signers: [deployer, ...signers],
          } = env;

          const [user] = signers;
          const token = _token.connect(user);
          preExistingAmount = parseEther(random(0.01, 1, true).toFixed(2));
          const recipient = randomBytes32();

          await fuelMessagePortal
            .connect(deployer)
            .setMessageSender(assetIssuerId);

          await token.mint(user, preExistingAmount);
          await token.approve(erc20Gateway, MaxUint256);

          await erc20Gateway
            .connect(user)
            .deposit(recipient, token, preExistingAmount);
        });

        it('uses cached decimals data');

        it('correctly updates global deposits', async () => {
          const {
            token: _token,
            erc20Gateway,
            fuelMessagePortal,
            assetIssuerId,
            signers: [, ...signers],
          } = env;

          const [user] = signers;
          const token = _token.connect(user);
          const amount = parseEther(random(0.01, 1, true).toFixed(2));
          const recipient = randomBytes32();

          await token.mint(user, amount);
          await token.approve(erc20Gateway, MaxUint256);

          const depositTx = erc20Gateway
            .connect(user)
            .deposit(recipient, token, amount);

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
              amount
            );

          const expectedMessageData = solidityPacked(
            [
              'uint8',
              'bytes32',
              'bytes32',
              'bytes32',
              'bytes32',
              'bytes32',
              'uint256',
              'uint8',
            ],
            [
              0,
              assetIssuerId,
              zeroPadValue(await token.getAddress(), 32),
              ZeroHash,
              zeroPadValue(user.address, 32),
              recipient,
              amount,
              await token.decimals(),
            ]
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
      });

      describe('when whitelist is enabled', () => {
        it('rejects deposits of non whitelisted tokens', async () => {
          const {
            token: _token,
            erc20Gateway,
            signers: [deployer, user],
          } = env;
          const token = _token.connect(user);

          const amount = parseEther(random(0.01, 1, true).toFixed(2));
          const recipient = randomBytes32();

          await token.mint(user, amount);
          await token.approve(erc20Gateway, MaxUint256);

          await erc20Gateway.connect(deployer).requireWhitelist(true);
          const depositTx = erc20Gateway
            .connect(user)
            .deposit(recipient, token, amount);

          await expect(depositTx).to.be.revertedWithCustomError(
            erc20Gateway,
            'GlobalDepositLimit'
          );
        });

        it('works if deposited amount is equal to the global limit', async () => {
          const {
            token: _token,
            erc20Gateway,
            fuelMessagePortal,
            signers: [deployer, user],
          } = env;
          const token = _token.connect(user);

          const amount = parseEther(random(0.01, 1, true).toFixed(2));
          const recipient = randomBytes32();

          await erc20Gateway.connect(deployer).requireWhitelist(true);
          await erc20Gateway
            .connect(deployer)
            .setGlobalDepositLimit(token, amount);

          await fuelMessagePortal
            .connect(deployer)
            .setMessageSender(env.assetIssuerId);

          await token.mint(user, amount);
          await token.approve(erc20Gateway, MaxUint256);

          const depositTx = erc20Gateway
            .connect(user)
            .deposit(recipient, token, amount);

          await expect(depositTx).to.changeTokenBalances(
            token,
            [user, erc20Gateway],
            [amount * -1n, amount]
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

          await token.mint(user, amount);
          await token.approve(erc20Gateway, MaxUint256);

          await erc20Gateway.connect(deployer).requireWhitelist(true);
          await erc20Gateway
            .connect(deployer)
            .setGlobalDepositLimit(token, amount - 1n);

          const depositTx = erc20Gateway
            .connect(user)
            .deposit(recipient, token, amount);

          await expect(depositTx).to.be.revertedWithCustomError(
            erc20Gateway,
            'GlobalDepositLimit'
          );
        });
      });

      describe('with 8 decimals tokens - WTBC', () => {
        it('todo');
      });
      describe('with 6 decimals tokens - USDT, USDC', () => {
        it('todo');
      });

      describe('with 9 decimals', () => {
        it('todo');
      });

      describe('with a token that does not have decimals', () => {
        it('todo');
      });
    });

    describe('finalizeWithdrawal', () => {
      const deposit = async () => {
        const {
          token: _token,
          erc20Gateway,
          fuelMessagePortal,
          signers: [deployer, user],
          assetIssuerId,
        } = env;
        const token = _token.connect(user);

        const amount = parseEther(random(0.01, 1, true).toFixed(2));
        const recipient = randomBytes32();

        await erc20Gateway
          .connect(deployer)
          .setGlobalDepositLimit(token, amount);

        await fuelMessagePortal
          .connect(deployer)
          .setMessageSender(assetIssuerId);
        const impersonatedPortal = await impersonateAccount(
          fuelMessagePortal,
          hre
        );

        await token.mint(user, amount);
        await token.approve(erc20Gateway, MaxUint256);

        await erc20Gateway.connect(user).deposit(recipient, token, amount);

        return { amount, recipient, impersonatedPortal };
      };

      it('can withdraw several times and reduces deposited balances', async () => {
        const { amount, impersonatedPortal } = await deposit();
        const withdrawAmount = amount / 4n;

        const {
          token,
          fuelMessagePortal,
          erc20Gateway,
          signers: [deployer],
        } = env;

        await fuelMessagePortal
          .connect(deployer)
          .setMessageSender(env.assetIssuerId);

        // Withdrawal 1
        {
          const recipient = randomAddress();
          const withdrawalTx = erc20Gateway
            .connect(impersonatedPortal)
            .finalizeWithdrawal(recipient, token, withdrawAmount, TOKEN_ID);

          await withdrawalTx;

          const expectedTokenTotals = amount - withdrawAmount;
          expect(await erc20Gateway.tokensDeposited(token)).to.be.equal(
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

          expect(await erc20Gateway.tokensDeposited(token)).to.be.equal(
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
              withdrawAmount
            );
        }
      });

      it('reverts if withdrawn amount is 0', async () => {
        const { impersonatedPortal } = await deposit();
        const withdrawAmount = 0;

        const {
          token,
          fuelMessagePortal,
          erc20Gateway,
          signers: [deployer],
        } = env;

        await fuelMessagePortal
          .connect(deployer)
          .setMessageSender(env.assetIssuerId);

        const recipient = randomAddress();
        const withdrawalTx = erc20Gateway
          .connect(impersonatedPortal)
          .finalizeWithdrawal(recipient, token, withdrawAmount, TOKEN_ID);

        await expect(withdrawalTx).to.be.revertedWithCustomError(
          erc20Gateway,
          'CannotWithdrawZero'
        );
      });

      it('reverts if trying to withdraw more than initially deposited', async () => {
        const { amount, impersonatedPortal } = await deposit();
        const withdrawAmount = amount + 1n;

        const { token, erc20Gateway } = env;

        const recipient = randomAddress();
        const withdrawalTx = erc20Gateway
          .connect(impersonatedPortal)
          .finalizeWithdrawal(recipient, token, withdrawAmount, TOKEN_ID);

        await expect(withdrawalTx).to.be.revertedWithPanic(
          UNDERFLOW_PANIC_CODE
        );
      });

      it('reverts when paused', async () => {
        const { amount, impersonatedPortal } = await deposit();
        const withdrawAmount = amount;

        const {
          token,
          fuelMessagePortal,
          erc20Gateway,
          signers: [deployer],
        } = env;

        await fuelMessagePortal
          .connect(deployer)
          .setMessageSender(env.assetIssuerId);

        const recipient = randomAddress();
        await erc20Gateway.connect(deployer).pause();

        const withdrawalTx = erc20Gateway
          .connect(impersonatedPortal)
          .finalizeWithdrawal(recipient, token, withdrawAmount, TOKEN_ID);

        await expect(withdrawalTx).to.be.revertedWith('Pausable: paused');
      });

      it('reverts when called by an unauthorized address', async () => {
        const { amount } = await deposit();
        const withdrawAmount = amount;

        const {
          token,
          fuelMessagePortal,
          erc20Gateway,
          signers: [deployer, mallory],
        } = env;

        await fuelMessagePortal
          .connect(deployer)
          .setMessageSender(env.assetIssuerId);

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

    describe('sendMetadata()', () => {
      describe('when paused', () => {
        it('reverts');
      });

      it('works', async () => {
        const { erc20Gateway, token } = env;

        await erc20Gateway.sendMetadata(token);
      });
    });
  });
}
