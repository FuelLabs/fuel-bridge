import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import {
  MaxUint256,
  ZeroHash,
  parseEther,
  parseUnits,
  solidityPacked,
  zeroPadValue,
} from 'ethers';
import type { BytesLike } from 'ethers';
import hre from 'hardhat';
import { random } from 'lodash';

import {
  CONTRACT_MESSAGE_PREDICATE,
  RATE_LIMIT_AMOUNT,
  RATE_LIMIT_DURATION,
  STANDARD_TOKEN_DECIMALS,
} from '../../protocol/constants';
import { randomAddress, randomBytes32 } from '../../protocol/utils';
import {
  CustomToken__factory,
  NoDecimalsToken__factory,
} from '../../typechain';
import type {
  MockFuelMessagePortal,
  FuelERC20GatewayV4,
  Token,
  CustomToken,
  NoDecimalsToken,
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

enum MessageType {
  DEPOSIT_TO_ADDR = 0,
  DEPOSIT_TO_CONTRACT = 1,
  DEPOSIT_WITH_DATA = 2,
  METADATA = 3,
}

const MessagePayloadSolidityTypes = [
  'uint256', // assetIssuerId
  'uint256', // message type
  'uint256', // tokenAddress
  'uint256', // tokenId
  'uint256', // depositor EVM address, padded
  'uint256', // recipient FuelVM address
  'uint256', // l2 amount to be minted
  'uint256', // decimals
];

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

      it('changes the deposit limit', async () => {
        const {
          erc20Gateway,
          token,
          signers: [deployer],
        } = env;

        await erc20Gateway
          .connect(deployer)
          .setGlobalDepositLimit(token, MaxUint256);

        expect(await erc20Gateway.depositLimits(token)).to.be.eq(MaxUint256);
      });
    });

    describe('initialize', () => {
      it('can only be called once', async () => {
        const {
          erc20Gateway,
          signers: [, mallory],
        } = env;

        const tx = erc20Gateway.connect(mallory).initialize(mallory);

        const expectedErrorMsg =
          'Initializable: contract is already initialized';
        await expect(tx).to.be.revertedWith(expectedErrorMsg);
      });
    });

    describe('pause', () => {
      it('can only be called with pauser role', async () => {
        const {
          erc20Gateway,
          signers: [deployer, mallory],
        } = env;

        const pauserRole = await erc20Gateway.PAUSER_ROLE();

        const tx = erc20Gateway.connect(mallory).pause();
        const expectedErrorMsg =
          `AccessControl: account ${(
            await mallory.getAddress()
          ).toLowerCase()} ` + `is missing role ${pauserRole}`;
        await expect(tx).to.be.revertedWith(expectedErrorMsg);

        await erc20Gateway.connect(deployer).grantRole(pauserRole, mallory);
        await erc20Gateway.connect(mallory).pause();
      });
    });

    describe('unpause', () => {
      it('can only be called with admin role', async () => {
        const {
          erc20Gateway,
          signers: [deployer, mallory],
        } = env;

        await erc20Gateway.connect(deployer).pause();
        const expectedErrorMsg =
          `AccessControl: account ${(
            await mallory.getAddress()
          ).toLowerCase()} ` + `is missing role ${ZeroHash}`;

        const tx = erc20Gateway.connect(mallory).unpause();
        await expect(tx).to.be.revertedWith(expectedErrorMsg);

        await erc20Gateway.connect(deployer).unpause();
      });
    });

    describe('setAssetIssuerId', () => {
      it('can only be called with admin role', async () => {
        const {
          erc20Gateway,
          signers: [deployer, mallory],
        } = env;

        const expectedErrorMsg =
          `AccessControl: account ${(
            await mallory.getAddress()
          ).toLowerCase()} ` + `is missing role ${ZeroHash}`;

        const tx = erc20Gateway.connect(mallory).setAssetIssuerId(ZeroHash);
        await expect(tx).to.be.revertedWith(expectedErrorMsg);

        await erc20Gateway.connect(deployer).setAssetIssuerId(ZeroHash);
      });
    });

    describe('requireWhitelist', () => {
      it('can only be called with admin role', async () => {
        const {
          erc20Gateway,
          signers: [deployer, mallory],
        } = env;

        const expectedErrorMsg =
          `AccessControl: account ${(
            await mallory.getAddress()
          ).toLowerCase()} ` + `is missing role ${ZeroHash}`;

        const tx = erc20Gateway.connect(mallory).requireWhitelist(true);
        await expect(tx).to.be.revertedWith(expectedErrorMsg);

        await erc20Gateway.connect(deployer).requireWhitelist(true);
      });

      it('changes whitelistRequired', async () => {
        const {
          erc20Gateway,
          signers: [deployer],
        } = env;

        const currentValue = await erc20Gateway.whitelistRequired();
        await erc20Gateway.connect(deployer).requireWhitelist(!currentValue);
        expect(await erc20Gateway.whitelistRequired()).to.be.eq(!currentValue);
      });
    });

    describe('rescueETH', () => {
      it('should allow to withdraw ETH sent by accident', async () => {
        const { erc20Gateway, deployer } = env;
        const value = parseEther('1'); // forwarded ether by accident

        await setBalance(await erc20Gateway.getAddress(), value);

        await expect(() =>
          erc20Gateway.connect(deployer).rescueETH()
        ).to.changeEtherBalance(deployer, value);
      });

      it('can only be called with admin role', async () => {
        const {
          erc20Gateway,
          signers: [, mallory],
        } = env;

        const malloryAddr = (await mallory.getAddress()).toLowerCase();
        const defaultAdminRole = ZeroHash;
        const error = `AccessControl: account ${malloryAddr} is missing role ${defaultAdminRole}`;
        const tx = erc20Gateway.connect(mallory).rescueETH();
        await expect(tx).to.be.revertedWith(error);
      });
    });

    describe('deposit', () => {
      it('reverts when paused', async () => {
        const {
          erc20Gateway,
          token,
          signers: [deployer, user],
        } = env;

        await erc20Gateway.connect(deployer).pause();

        const depositTo = randomBytes32();
        const depositAmount = MaxUint256;

        const tx = erc20Gateway
          .connect(user)
          .deposit(depositTo, token, depositAmount);

        await expect(tx).to.be.revertedWith('Pausable: paused');
      });

      it('reverts when whitelist is required', async () => {
        const {
          erc20Gateway,
          token,
          signers: [deployer, user],
        } = env;

        await erc20Gateway.connect(deployer).requireWhitelist(true);

        const depositTo = randomBytes32();
        const depositAmount = parseEther('10');

        const tx = erc20Gateway
          .connect(user)
          .deposit(depositTo, token, depositAmount);

        await expect(tx).to.be.revertedWithCustomError(
          erc20Gateway,
          'GlobalDepositLimit'
        );
      });

      it('reverts when deposit limits are enabled', async () => {
        const {
          erc20Gateway,
          token,
          signers: [deployer, user],
        } = env;

        const depositTo = randomBytes32();
        const depositAmount = parseEther('10');
        const downscaledDepositAmount = depositAmount / 10n ** 9n;

        await erc20Gateway.connect(deployer).requireWhitelist(true);
        await erc20Gateway
          .connect(deployer)
          .setGlobalDepositLimit(token, downscaledDepositAmount - 1n);

        await token.mint(user, depositAmount);
        await token.connect(user).approve(erc20Gateway, MaxUint256);
        const tx = erc20Gateway
          .connect(user)
          .deposit(depositTo, token, depositAmount);

        await expect(tx).to.be.revertedWithCustomError(
          erc20Gateway,
          'GlobalDepositLimit'
        );

        await erc20Gateway
          .connect(deployer)
          .setGlobalDepositLimit(token, downscaledDepositAmount);

        await erc20Gateway
          .connect(user)
          .deposit(depositTo, token, depositAmount);
      });

      const DECIMALS = [0, 6, 8, 9];

      for (const decimals of DECIMALS) {
        describe(`with ${decimals} decimals (no downscaling)`, () => {
          let token: CustomToken;

          beforeEach('setup the tests', async () => {
            const { deployer } = env;
            token = await new CustomToken__factory(deployer).deploy(decimals);
          });

          it('reverts when the deposited amount exceeds u64::MAX', async () => {
            const {
              erc20Gateway,
              signers: [, user],
            } = env;

            const tx = erc20Gateway
              .connect(user)
              .deposit(randomBytes32(), token, 2n ** 64n);
            await expect(tx).to.be.revertedWithCustomError(
              erc20Gateway,
              'InvalidAmount'
            );
          });

          it('reverts when the total deposits exceed u64::MAX', async () => {
            const {
              erc20Gateway,
              signers: [deployer, user],
            } = env;

            const maxUint64 = 2n ** 64n - 1n;

            await token.connect(deployer).mint(user, MaxUint256);
            await token.connect(user).approve(erc20Gateway, MaxUint256);
            await erc20Gateway
              .connect(user)
              .deposit(randomBytes32(), token, maxUint64);

            const tx = erc20Gateway
              .connect(user)
              .deposit(randomBytes32(), token, 1n);

            await expect(tx).to.be.revertedWithCustomError(
              erc20Gateway,
              'BridgeFull'
            );
          });

          it('calls FuelMessagePortal', async () => {
            const {
              erc20Gateway,
              fuelMessagePortal,
              assetIssuerId,
              signers: [deployer, user],
            } = env;

            const depositAmount = parseUnits('10', Number(decimals));
            const depositTo = randomBytes32();

            await token.connect(deployer).mint(user, depositAmount);
            await token.connect(user).approve(erc20Gateway, MaxUint256);

            const tx = erc20Gateway
              .connect(user)
              .deposit(depositTo, token, depositAmount);

            const expectedData = solidityPacked(MessagePayloadSolidityTypes, [
              assetIssuerId,
              MessageType.DEPOSIT_TO_ADDR,
              zeroPadValue(await token.getAddress(), 32),
              ZeroHash,
              zeroPadValue(await user.getAddress(), 32),
              depositTo,
              depositAmount,
              decimals,
            ]);
            await expect(tx)
              .to.emit(fuelMessagePortal, 'SendMessageCalled')
              .withArgs(CONTRACT_MESSAGE_PREDICATE, expectedData);
          });

          it('pulls tokens from depositor', async () => {
            const {
              erc20Gateway,
              signers: [deployer, user],
            } = env;

            const depositAmount = parseUnits('10', Number(decimals));
            const depositTo = randomBytes32();

            await token.connect(deployer).mint(user, depositAmount);
            await token.connect(user).approve(erc20Gateway, MaxUint256);

            const tx = erc20Gateway
              .connect(user)
              .deposit(depositTo, token, depositAmount);

            await expect(tx).to.changeTokenBalances(
              token,
              [erc20Gateway, user],
              [depositAmount, -depositAmount]
            );
          });

          it('emits a deposit event', async () => {
            const {
              erc20Gateway,
              signers: [deployer, user],
            } = env;

            const depositAmount = parseUnits('10', Number(decimals));
            const depositTo = randomBytes32();

            await token.connect(deployer).mint(user, depositAmount);
            await token.connect(user).approve(erc20Gateway, MaxUint256);

            const tx = erc20Gateway
              .connect(user)
              .deposit(depositTo, token, depositAmount);

            await expect(tx)
              .to.emit(erc20Gateway, 'Deposit')
              .withArgs(
                zeroPadValue(await user.getAddress(), 32),
                token,
                depositAmount
              );
          });

          it('updates deposited amounts', async () => {
            const {
              erc20Gateway,
              signers: [deployer, user],
            } = env;

            const depositAmount = parseUnits('10', Number(decimals));
            const depositTo = randomBytes32();

            await token.connect(deployer).mint(user, depositAmount);
            await token.connect(user).approve(erc20Gateway, MaxUint256);

            const previousDepositedAmount = await erc20Gateway.tokensDeposited(
              token
            );

            await erc20Gateway
              .connect(user)
              .deposit(depositTo, token, depositAmount);

            expect(previousDepositedAmount + depositAmount).to.equal(
              await erc20Gateway.tokensDeposited(token)
            );
          });

          it('caches decimals of the deposited token', async () => {
            const {
              erc20Gateway,
              signers: [deployer, user],
            } = env;

            const depositAmount = parseUnits('10', Number(decimals));
            const depositTo = randomBytes32();

            await token.connect(deployer).mint(user, depositAmount * 2n);
            await token.connect(user).approve(erc20Gateway, MaxUint256);

            const { gasUsed: gasUsedOnFirstCall } = await erc20Gateway
              .connect(user)
              .deposit(depositTo, token, depositAmount)
              .then((tx) => tx.wait());

            const { gasUsed: gasUsedOnSecondCall } = await erc20Gateway
              .connect(user)
              .deposit(depositTo, token, depositAmount)
              .then((tx) => tx.wait());

            expect(gasUsedOnFirstCall).to.be.gt(gasUsedOnSecondCall + 23000n);
          });
        });
      }

      describe(`with no decimals`, () => {
        const decimals = 0;
        let token: NoDecimalsToken;

        beforeEach('setup the tests', async () => {
          const { deployer } = env;
          token = await new NoDecimalsToken__factory(deployer).deploy(decimals);
        });

        it('reverts when the deposited amount exceeds u64::MAX', async () => {
          const {
            erc20Gateway,
            signers: [, user],
          } = env;

          const tx = erc20Gateway
            .connect(user)
            .deposit(randomBytes32(), token, 2n ** 64n);
          await expect(tx).to.be.revertedWithCustomError(
            erc20Gateway,
            'InvalidAmount'
          );
        });

        it('reverts when the total deposits exceed u64::MAX', async () => {
          const {
            erc20Gateway,
            signers: [deployer, user],
          } = env;

          const maxUint64 = 2n ** 64n - 1n;

          await token.connect(deployer).mint(user, MaxUint256);
          await token.connect(user).approve(erc20Gateway, MaxUint256);
          await erc20Gateway
            .connect(user)
            .deposit(randomBytes32(), token, maxUint64);

          const tx = erc20Gateway
            .connect(user)
            .deposit(randomBytes32(), token, 1n);

          await expect(tx).to.be.revertedWithCustomError(
            erc20Gateway,
            'BridgeFull'
          );
        });

        it('calls FuelMessagePortal', async () => {
          const {
            erc20Gateway,
            fuelMessagePortal,
            assetIssuerId,
            signers: [deployer, user],
          } = env;

          const depositAmount = parseUnits('10', Number(decimals));
          const depositTo = randomBytes32();

          await token.connect(deployer).mint(user, depositAmount);
          await token.connect(user).approve(erc20Gateway, MaxUint256);

          const tx = erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount);

          const expectedData = solidityPacked(MessagePayloadSolidityTypes, [
            assetIssuerId,
            MessageType.DEPOSIT_TO_ADDR,
            zeroPadValue(await token.getAddress(), 32),
            ZeroHash,
            zeroPadValue(await user.getAddress(), 32),
            depositTo,
            depositAmount,
            decimals,
          ]);
          await expect(tx)
            .to.emit(fuelMessagePortal, 'SendMessageCalled')
            .withArgs(CONTRACT_MESSAGE_PREDICATE, expectedData);
        });

        it('pulls tokens from depositor', async () => {
          const {
            erc20Gateway,
            signers: [deployer, user],
          } = env;

          const depositAmount = parseUnits('10', Number(decimals));
          const depositTo = randomBytes32();

          await token.connect(deployer).mint(user, depositAmount);
          await token.connect(user).approve(erc20Gateway, MaxUint256);

          const tx = erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount);

          await expect(tx).to.changeTokenBalances(
            token,
            [erc20Gateway, user],
            [depositAmount, -depositAmount]
          );
        });

        it('emits a deposit event', async () => {
          const {
            erc20Gateway,
            signers: [deployer, user],
          } = env;

          const depositAmount = parseUnits('10', Number(decimals));
          const depositTo = randomBytes32();

          await token.connect(deployer).mint(user, depositAmount);
          await token.connect(user).approve(erc20Gateway, MaxUint256);

          const tx = erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount);

          await expect(tx)
            .to.emit(erc20Gateway, 'Deposit')
            .withArgs(
              zeroPadValue(await user.getAddress(), 32),
              token,
              depositAmount
            );
        });

        it('updates deposited amounts', async () => {
          const {
            erc20Gateway,
            signers: [deployer, user],
          } = env;

          const depositAmount = parseUnits('10', Number(decimals));
          const depositTo = randomBytes32();

          await token.connect(deployer).mint(user, depositAmount);
          await token.connect(user).approve(erc20Gateway, MaxUint256);

          const previousDepositedAmount = await erc20Gateway.tokensDeposited(
            token
          );

          await erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount);

          expect(previousDepositedAmount + depositAmount).to.equal(
            await erc20Gateway.tokensDeposited(token)
          );
        });

        it('caches decimals of the deposited token', async () => {
          const {
            erc20Gateway,
            signers: [deployer, user],
          } = env;

          const depositAmount = parseUnits('10', Number(decimals));
          const depositTo = randomBytes32();

          await token.connect(deployer).mint(user, depositAmount * 2n);
          await token.connect(user).approve(erc20Gateway, MaxUint256);

          const { gasUsed: gasUsedOnFirstCall } = await erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount)
            .then((tx) => tx.wait());

          const { gasUsed: gasUsedOnSecondCall } = await erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount)
            .then((tx) => tx.wait());

          expect(gasUsedOnFirstCall).to.be.gt(gasUsedOnSecondCall + 23000n);
        });
      });

      describe('with 18 decimals token', () => {
        const DECIMALS = 18n;
        const PRECISION_DOWNSCALING = 10n ** (DECIMALS - 9n);

        it('reverts when the deposited amount exceeds u64::MAX', async () => {
          const {
            erc20Gateway,
            signers: [, user],
            token,
          } = env;

          const tx = erc20Gateway
            .connect(user)
            .deposit(randomBytes32(), token, PRECISION_DOWNSCALING * 2n ** 64n);
          await expect(tx).to.be.revertedWithCustomError(
            erc20Gateway,
            'InvalidAmount'
          );
        });

        it('reverts when the total deposits exceed u64::MAX', async () => {
          const {
            erc20Gateway,
            signers: [deployer, user],
            token,
          } = env;

          const maxUint64 = PRECISION_DOWNSCALING * (2n ** 64n - 1n);

          await token.connect(deployer).mint(user, MaxUint256);
          await token.connect(user).approve(erc20Gateway, MaxUint256);
          await erc20Gateway
            .connect(user)
            .deposit(randomBytes32(), token, maxUint64);

          const tx = erc20Gateway
            .connect(user)
            .deposit(randomBytes32(), token, PRECISION_DOWNSCALING);

          await expect(tx).to.be.revertedWithCustomError(
            erc20Gateway,
            'BridgeFull'
          );
        });

        it('reverts when the deposit amount cannot be downscaled', async () => {
          const {
            erc20Gateway,
            token,
            signers: [deployer, user],
          } = env;

          const depositAmount = parseEther('0.0000000001');
          const depositTo = randomBytes32();

          await token.connect(deployer).mint(user, depositAmount);
          await token.connect(user).approve(erc20Gateway, MaxUint256);

          const tx = erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount);

          await expect(tx).to.be.revertedWithCustomError(
            erc20Gateway,
            'InvalidAmount'
          );
        });

        it('calls FuelMessagePortal', async () => {
          const {
            erc20Gateway,
            fuelMessagePortal,
            assetIssuerId,
            token,
            signers: [deployer, user],
          } = env;

          const depositAmount = parseEther('10');
          const downscaledDepositAmount = depositAmount / PRECISION_DOWNSCALING;
          const depositTo = randomBytes32();

          await token.connect(deployer).mint(user, depositAmount);
          await token.connect(user).approve(erc20Gateway, MaxUint256);

          const tx = erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount);

          const expectedData = solidityPacked(MessagePayloadSolidityTypes, [
            assetIssuerId,
            MessageType.DEPOSIT_TO_ADDR,
            zeroPadValue(await token.getAddress(), 32),
            ZeroHash,
            zeroPadValue(await user.getAddress(), 32),
            depositTo,
            downscaledDepositAmount,
            DECIMALS,
          ]);
          await expect(tx)
            .to.emit(fuelMessagePortal, 'SendMessageCalled')
            .withArgs(CONTRACT_MESSAGE_PREDICATE, expectedData);
        });

        it('pulls tokens from depositor', async () => {
          const {
            erc20Gateway,
            signers: [deployer, user],
            token,
          } = env;

          const depositAmount = parseEther('10');
          const depositTo = randomBytes32();

          await token.connect(deployer).mint(user, depositAmount);
          await token.connect(user).approve(erc20Gateway, MaxUint256);

          const tx = erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount);

          await expect(tx).to.changeTokenBalances(
            token,
            [erc20Gateway, user],
            [depositAmount, -depositAmount]
          );
        });

        it('emits a deposit event', async () => {
          const {
            erc20Gateway,
            signers: [deployer, user],
            token,
          } = env;

          const depositAmount = parseEther('10');
          const depositTo = randomBytes32();

          await token.connect(deployer).mint(user, depositAmount);
          await token.connect(user).approve(erc20Gateway, MaxUint256);

          const tx = erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount);

          await expect(tx)
            .to.emit(erc20Gateway, 'Deposit')
            .withArgs(
              zeroPadValue(await user.getAddress(), 32),
              token,
              depositAmount
            );
        });

        it('updates deposited amounts', async () => {
          const {
            erc20Gateway,
            signers: [deployer, user],
            token,
          } = env;

          const depositAmount = parseEther('10');
          const downscaledDepositAmount = depositAmount / PRECISION_DOWNSCALING;
          const depositTo = randomBytes32();

          await token.connect(deployer).mint(user, depositAmount);
          await token.connect(user).approve(erc20Gateway, MaxUint256);

          const previousDepositedAmount = await erc20Gateway.tokensDeposited(
            token
          );

          await erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount);

          expect(previousDepositedAmount + downscaledDepositAmount).to.equal(
            await erc20Gateway.tokensDeposited(token)
          );
        });

        it('caches decimals of the deposited token', async () => {
          const {
            erc20Gateway,
            signers: [deployer, user],
            token,
          } = env;

          const depositAmount = parseEther('10');
          const depositTo = randomBytes32();

          await token.connect(deployer).mint(user, depositAmount * 2n);
          await token.connect(user).approve(erc20Gateway, MaxUint256);

          const { gasUsed: gasUsedOnFirstCall } = await erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount)
            .then((tx) => tx.wait());

          const { gasUsed: gasUsedOnSecondCall } = await erc20Gateway
            .connect(user)
            .deposit(depositTo, token, depositAmount)
            .then((tx) => tx.wait());

          expect(gasUsedOnFirstCall).to.be.gt(gasUsedOnSecondCall + 23000n);
        });
      });

      describe('with no decimals token', () => {
        it('todo');
      });
    });

    describe('depositWithData', () => {
      it('reverts when paused');
      it('reverts when whitelist is required');
      describe('without data', () => {
        it('sends a deposit message of type DEPOSIT_TO_CONTRACT');
      });
      describe('with data', () => {
        it('sends a deposit message of type DEPOSIT_WITH_DATA');
      });
    });
    describe('sendMetadata', () => {
      it('reverts when paused');
      it('reverts when whitelist is required');
      it('reverts with no metadata');
      describe('with bytes32 name', () => {
        it('works');
      });
      describe('with string name', () => {
        it('works');
      });
    });

    describe('finalizeWithdrawal', () => {
      it('can only be called by message portal and asset issuer', async () => {
        const {
          erc20Gateway,
          fuelMessagePortal,
          token,
          signers: [deployer, mallory],
        } = env;

        await erc20Gateway.connect(deployer).setAssetIssuerId(randomBytes32());

        const failingTx = erc20Gateway
          .connect(mallory)
          .finalizeWithdrawal(mallory, token, MaxUint256, 0);

        await expect(failingTx).to.be.revertedWithCustomError(
          erc20Gateway,
          'CallerIsNotPortal'
        );

        const impersonatedPortal = await impersonateAccount(
          fuelMessagePortal,
          hre
        );

        const tx = erc20Gateway
          .connect(impersonatedPortal)
          .finalizeWithdrawal(mallory, token, MaxUint256, 0);

        await expect(tx).to.be.revertedWithCustomError(
          erc20Gateway,
          'InvalidSender'
        );
      });

      it('reverts when paused', async () => {
        const {
          erc20Gateway,
          fuelMessagePortal,
          token,
          signers: [deployer, user],
        } = env;

        await erc20Gateway.connect(deployer).pause();

        const impersonatedPortal = await impersonateAccount(
          fuelMessagePortal,
          hre
        );

        const tx = erc20Gateway
          .connect(impersonatedPortal)
          .finalizeWithdrawal(user, token, MaxUint256, 0);

        await expect(tx).to.be.revertedWith('Pausable: paused');
      });

      it('reverts with 0 amount', async () => {
        const {
          erc20Gateway,
          fuelMessagePortal,
          token,
          signers: [, user],
        } = env;

        const impersonatedPortal = await impersonateAccount(
          fuelMessagePortal,
          hre
        );

        const tx = erc20Gateway
          .connect(impersonatedPortal)
          .finalizeWithdrawal(user, token, 0, 0);

        await expect(tx).to.be.revertedWithCustomError(
          erc20Gateway,
          'CannotWithdrawZero'
        );
      });

      const DECIMALS = [6, 8, 9];

      for (const decimals of DECIMALS) {
        describe(`with ${decimals} decimals token`, () => {
          let token: CustomToken;

          beforeEach('deploy token', async () => {
            const {
              deployer,
              signers: [, user],
            } = env;
            token = (
              await new CustomToken__factory(deployer).deploy(decimals)
            ).connect(user);
          });

          it('reverts when rate limit is reset without initializing it first', async () => {
            const {
              erc20Gateway,
              signers: [deployer, user],
            } = env;

            const rateLimitAmount =
              RATE_LIMIT_AMOUNT / 10 ** (STANDARD_TOKEN_DECIMALS - decimals);

            await expect(
              erc20Gateway
                .connect(deployer)
                .resetRateLimitAmount(
                  token.getAddress(),
                  rateLimitAmount.toString(),
                  RATE_LIMIT_DURATION
                )
            ).to.be.revertedWithCustomError(
              erc20Gateway,
              'RateLimitNotInitialized'
            );
          });

          it('reverts when rate limit is initialized again', async () => {
            const {
              erc20Gateway,
              signers: [deployer, user],
            } = env;

            const rateLimitAmount =
              RATE_LIMIT_AMOUNT / 10 ** (STANDARD_TOKEN_DECIMALS - decimals);

            await erc20Gateway
              .connect(deployer)
              .initializeRateLimit(
                token.getAddress(),
                rateLimitAmount.toString(),
                RATE_LIMIT_DURATION
              );

            const tx = erc20Gateway
              .connect(deployer)
              .resetRateLimitAmount(
                token.getAddress(),
                rateLimitAmount.toString(),
                RATE_LIMIT_DURATION
              );

            await expect(tx)
              .to.emit(erc20Gateway, 'ResetRateLimit')
              .withArgs(token.getAddress(), rateLimitAmount.toString());

            await expect(
              erc20Gateway
                .connect(deployer)
                .initializeRateLimit(
                  token.getAddress(),
                  rateLimitAmount.toString(),
                  RATE_LIMIT_DURATION
                )
            ).to.be.revertedWithCustomError(
              erc20Gateway,
              'RateLimitAlreadySet'
            );
          });

          it('reduces deposits and transfers out without upscaling', async () => {
            const {
              erc20Gateway,
              fuelMessagePortal,
              signers: [deployer, user],
              assetIssuerId,
            } = env;

            const rateLimitAmount =
              RATE_LIMIT_AMOUNT / 10 ** (STANDARD_TOKEN_DECIMALS - decimals);

            await erc20Gateway
              .connect(deployer)
              .initializeRateLimit(
                token.getAddress(),
                rateLimitAmount.toString(),
                RATE_LIMIT_DURATION
              );

            const amount = parseUnits(
              random(0.01, 1, true).toFixed(decimals),
              Number(decimals)
            );
            const recipient = randomBytes32();

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
            const withdrawAmount = amount / 4n;

            // Withdrawal 1
            {
              const recipient = randomAddress();
              const withdrawalTx = erc20Gateway
                .connect(impersonatedPortal)
                .finalizeWithdrawal(recipient, token, withdrawAmount, 0);

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
                .finalizeWithdrawal(recipient, token, withdrawAmount, 0);

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

              // check rate limit params
              const withdrawnAmountAfterRelay =
                await erc20Gateway.currentPeriodAmount(token.getAddress());

              await expect(withdrawnAmountAfterRelay == withdrawAmount * 2n).to
                .be.true;
            }
          });
        });
      }

      describe(`with 0 decimals token`, () => {
        let token: CustomToken;
        const decimals = 0;
        beforeEach('deploy token', async () => {
          const {
            deployer,
            signers: [, user],
          } = env;
          token = (
            await new CustomToken__factory(deployer).deploy(decimals)
          ).connect(user);
        });

        it('reduces deposits and transfers out without upscaling', async () => {
          const {
            erc20Gateway,
            fuelMessagePortal,
            signers: [deployer, user],
            assetIssuerId,
          } = env;

          const amount = 2n ** 64n - 1n;
          const recipient = randomBytes32();

          await fuelMessagePortal
            .connect(deployer)
            .setMessageSender(assetIssuerId);

          const impersonatedPortal = await impersonateAccount(
            fuelMessagePortal,
            hre
          );

          await token.mint(user, amount);
          await token.approve(erc20Gateway, MaxUint256);

          await erc20Gateway
            .connect(deployer)
            .initializeRateLimit(
              token.getAddress(),
              amount.toString(),
              RATE_LIMIT_DURATION
            );

          await erc20Gateway.connect(user).deposit(recipient, token, amount);
          const withdrawAmount = amount / 4n;

          // Withdrawal 1
          {
            const recipient = randomAddress();
            const withdrawalTx = erc20Gateway
              .connect(impersonatedPortal)
              .finalizeWithdrawal(recipient, token, withdrawAmount, 0);

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
              .finalizeWithdrawal(recipient, token, withdrawAmount, 0);

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
      });

      describe('with 18 decimals token', () => {
        it('reduces deposits and transfers out without upscaling', async () => {
          const {
            token: _token,
            erc20Gateway,
            fuelMessagePortal,
            signers: [deployer, user],
            assetIssuerId,
          } = env;
          const token = _token.connect(user);
          const amount = parseUnits(random(0.01, 1, true).toFixed(2));
          const recipient = randomBytes32();

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

          const upscaling = 10n ** 9n;
          const withdrawAmount = amount / 4n;
          const l2BurntAmount = withdrawAmount / upscaling;

          // Withdrawal 1
          {
            const recipient = randomAddress();
            const withdrawalTx = erc20Gateway
              .connect(impersonatedPortal)
              .finalizeWithdrawal(recipient, token, l2BurntAmount, 0);

            await withdrawalTx;

            const expectedTokenTotals = (amount - withdrawAmount) / upscaling;
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
              .finalizeWithdrawal(recipient, token, l2BurntAmount, 0);

            await withdrawalTx;

            const expectedTokenTotals =
              (amount - withdrawAmount * 2n) / upscaling;

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
      });
    });
  });
}
