import { hexZeroPad } from '@ethersproject/bytes';
import chai from 'chai';
import type { BigNumberish } from 'ethers';
import { BigNumber as BN, constants, utils } from 'ethers';
import hre from 'hardhat';

import type { HarnessObject } from '../protocol/harness';
import { randomAddress, randomBytes32 } from '../protocol/utils';
import type {
  FuelERC20Gateway,
  MockFuelMessagePortal,
  Token,
} from '../typechain';

import { impersonateAccount } from './hardhat-utils/impersonateAccount';

const { expect } = chai;
const { ethers, deployments } = hre;

type Fixture = Pick<
  HarnessObject,
  | 'token'
  | 'fuelERC20Gateway'
  | 'addresses'
  | 'signers'
  | 'deployer'
  | 'initialTokenAmount'
> & { fuelMessagePortalMock: MockFuelMessagePortal };

describe('ERC20 Gateway', async () => {
  let env: Fixture;

  // Message data
  const fuelTokenTarget1 = randomBytes32();
  const fuelTokenTarget2 = randomBytes32();

  const fixture = deployments.createFixture(async (hre) => {
    const signers = await hre.ethers.getSigners();
    const addresses = signers.map((signer) => signer.address);
    const [deployer] = signers;

    const token = await hre.ethers
      .getContractFactory('Token', deployer)
      .then((factory) => factory.deploy() as Promise<Token>);
    const fuelMessagePortalMock = await hre.ethers
      .getContractFactory('MockFuelMessagePortal', deployer)
      .then((factory) => factory.deploy() as Promise<MockFuelMessagePortal>);
    const fuelERC20Gateway = await hre.ethers
      .getContractFactory('FuelERC20Gateway', deployer)
      .then(
        (factory) =>
          hre.upgrades.deployProxy(factory, [fuelMessagePortalMock.address], {
            initializer: 'initialize',
          }) as Promise<FuelERC20Gateway>
      );

    const initialTokenAmount = ethers.utils.parseEther('1000000');
    for (let i = 0; i < signers.length; i += 1) {
      await token.mint(await signers[i].getAddress(), initialTokenAmount);
    }

    await token
      .connect(signers[0])
      .approve(fuelERC20Gateway.address, initialTokenAmount);

    return {
      token,
      fuelMessagePortalMock,
      fuelERC20Gateway,
      addresses,
      signers,
      deployer,
      initialTokenAmount,
    };
  });

  before(async () => {
    env = await fixture();
  });

  describe('Make both valid and invalid ERC20 deposits', async () => {
    it('Should not be able to deposit zero', async () => {
      const { token, fuelERC20Gateway } = env;

      const previousBalance = await token.balanceOf(fuelERC20Gateway.address);

      // Attempt deposit
      await expect(
        fuelERC20Gateway.deposit(
          randomBytes32(),
          token.address,
          fuelTokenTarget1,
          0
        )
      ).to.be.revertedWith('Cannot deposit zero');

      const newBalance = await token.balanceOf(fuelERC20Gateway.address);
      expect(newBalance).to.be.equal(previousBalance);
    });

    it('Should be able to deposit tokens', async () => {
      const depositAmount1 = 250;
      const depositRecipient1 = randomBytes32();
      await behavesLikeGatewayDeposit(
        env,
        depositAmount1,
        depositRecipient1,
        fuelTokenTarget1
      );

      const depositAmount2 = 250;
      const depositRecipient2 = randomBytes32();
      await behavesLikeGatewayDeposit(
        env,
        depositAmount2,
        depositRecipient2,
        fuelTokenTarget2
      );

      async function behavesLikeGatewayDeposit(
        { token, fuelERC20Gateway }: Fixture,
        depositAmount: BigNumberish,
        depositRecipient: string,
        fuelTokenTarget: string
      ) {
        const senderAddress = (
          await fuelERC20Gateway.signer.getAddress()
        ).toLowerCase();

        const depositTx = fuelERC20Gateway.deposit(
          depositRecipient,
          token.address,
          fuelTokenTarget,
          depositAmount
        );

        await expect(depositTx)
          .to.emit(fuelERC20Gateway, 'Deposit')
          .withArgs(
            hexZeroPad(senderAddress, 32),
            token.address,
            fuelTokenTarget,
            depositAmount
          );

        await expect(depositTx).to.changeTokenBalance(
          token,
          fuelERC20Gateway.address,
          depositAmount
        );
      }
    });

    it('Should be able to deposit tokens with data', async () => {
      const { fuelERC20Gateway, token } = env;

      const depositRecipient = randomBytes32();
      const depositData = [3, 2, 6, 9, 2, 5];
      const depositAmount = 85;

      const senderAddress = (
        await fuelERC20Gateway.signer.getAddress()
      ).toLowerCase();

      const depositTx = fuelERC20Gateway.depositWithData(
        depositRecipient,
        token.address,
        fuelTokenTarget1,
        depositAmount,
        depositData
      );

      await expect(depositTx)
        .to.emit(fuelERC20Gateway, 'Deposit')
        .withArgs(
          hexZeroPad(senderAddress, 32),
          token.address,
          fuelTokenTarget1,
          depositAmount
        );

      await expect(depositTx).to.changeTokenBalance(
        token,
        fuelERC20Gateway.address,
        depositAmount
      );
    });

    it('Should be able to deposit tokens with empty data', async () => {
      const { fuelERC20Gateway, token } = env;

      const depositRecipient = randomBytes32();
      const depositData = [];
      const depositAmount = 85;

      const senderAddress = (
        await fuelERC20Gateway.signer.getAddress()
      ).toLowerCase();

      const depositTx = fuelERC20Gateway.depositWithData(
        depositRecipient,
        token.address,
        fuelTokenTarget1,
        depositAmount,
        depositData
      );

      await expect(depositTx)
        .to.emit(fuelERC20Gateway, 'Deposit')
        .withArgs(
          hexZeroPad(senderAddress, 32),
          token.address,
          fuelTokenTarget1,
          depositAmount
        );

      await expect(depositTx).to.changeTokenBalance(
        token,
        fuelERC20Gateway.address,
        depositAmount
      );
    });
  });

  describe('Make both valid and invalid ERC20 withdrawals', async () => {
    it('Should not be able to directly call finalize', async () => {
      const {
        fuelERC20Gateway,
        token,
        addresses: [, , to],
      } = env;
      await expect(
        env.fuelERC20Gateway.finalizeWithdrawal(
          to,
          token.address,
          BN.from(100),
          ethers.constants.HashZero
        )
      ).to.be.revertedWithCustomError(fuelERC20Gateway, 'CallerIsNotPortal');
    });

    it('Should be able to finalize valid withdrawal through portal', async () => {
      const {
        fuelERC20Gateway,
        token,
        fuelMessagePortalMock,
        addresses: [, , recipient],
      } = env;

      await fuelMessagePortalMock.setMessageSender(fuelTokenTarget1);
      const withdrawalAmount = 100;
      const impersonatedPortal = await impersonateAccount(
        fuelMessagePortalMock,
        hre
      );

      const withdrawTx = fuelERC20Gateway
        .connect(impersonatedPortal)
        .finalizeWithdrawal(recipient, token.address, withdrawalAmount, 0);

      await expect(withdrawTx).to.changeTokenBalances(
        token,
        [recipient, fuelERC20Gateway],
        [withdrawalAmount, -withdrawalAmount]
      );
    });

    it('Should be able to finalize valid withdrawal through portal again', async () => {
      const {
        fuelERC20Gateway,
        token,
        fuelMessagePortalMock,
        addresses: [, , , recipient],
      } = env;

      await fuelMessagePortalMock.setMessageSender(fuelTokenTarget1);
      const withdrawalAmount = 75;
      const impersonatedPortal = await impersonateAccount(
        fuelMessagePortalMock,
        hre
      );

      const withdrawTx = fuelERC20Gateway
        .connect(impersonatedPortal)
        .finalizeWithdrawal(recipient, token.address, withdrawalAmount, 0);

      await expect(withdrawTx).to.changeTokenBalances(
        token,
        [recipient, fuelERC20Gateway],
        [withdrawalAmount, -withdrawalAmount]
      );
    });

    it('Should not be able to finalize withdrawal with more than deposited', async () => {
      const {
        fuelERC20Gateway,
        token,
        fuelMessagePortalMock,
        addresses: [, , , recipient],
      } = env;

      await fuelMessagePortalMock.setMessageSender(fuelTokenTarget1);
      const withdrawableAmount = await fuelERC20Gateway.tokensDeposited(
        token.address,
        fuelTokenTarget1
      );
      const impersonatedPortal = await impersonateAccount(
        fuelMessagePortalMock,
        hre
      );

      await fuelERC20Gateway
        .connect(impersonatedPortal)
        .callStatic.finalizeWithdrawal(
          recipient,
          token.address,
          withdrawableAmount,
          0
        );

      const withdrawTx = fuelERC20Gateway
        .connect(impersonatedPortal)
        .finalizeWithdrawal(
          recipient,
          token.address,
          withdrawableAmount.add(1),
          0
        );

      await expect(withdrawTx).to.be.revertedWithPanic(0x11);
    });

    it('Should not be able to finalize withdrawal of zero tokens', async () => {
      const {
        fuelERC20Gateway,
        token,
        fuelMessagePortalMock,
        addresses: [, , , recipient],
      } = env;

      const impersonatedPortal = await impersonateAccount(
        fuelMessagePortalMock,
        hre
      );

      const withdrawTx = fuelERC20Gateway
        .connect(impersonatedPortal)
        .finalizeWithdrawal(recipient, token.address, 0, 0);

      await expect(withdrawTx).to.be.revertedWith('Cannot withdraw zero');
    });

    it('Should not be able to finalize withdrawal with bad L2 token', async () => {
      const {
        fuelERC20Gateway,
        token,
        fuelMessagePortalMock,
        addresses: [, , , recipient],
      } = env;

      const L2Token = randomBytes32();
      expect(
        await fuelERC20Gateway.tokensDeposited(token.address, L2Token)
      ).to.be.equal(0);

      await fuelMessagePortalMock.setMessageSender(L2Token);
      const withdrawalAmount = 1;
      const impersonatedPortal = await impersonateAccount(
        fuelMessagePortalMock,
        hre
      );

      const withdrawTx = fuelERC20Gateway
        .connect(impersonatedPortal)
        .finalizeWithdrawal(recipient, token.address, withdrawalAmount, 0);

      await expect(withdrawTx).to.be.revertedWithPanic(0x11);
    });

    it('Should not be able to finalize withdrawal with bad L1 token', async () => {
      const {
        fuelERC20Gateway,
        fuelMessagePortalMock,
        addresses: [, , , recipient],
      } = env;

      expect(
        await fuelERC20Gateway.tokensDeposited(
          randomAddress(),
          fuelTokenTarget1
        )
      ).to.be.equal(0);

      await fuelMessagePortalMock.setMessageSender(fuelTokenTarget1);
      const withdrawalAmount = 1;
      const impersonatedPortal = await impersonateAccount(
        fuelMessagePortalMock,
        hre
      );

      const withdrawTx = fuelERC20Gateway
        .connect(impersonatedPortal)
        .finalizeWithdrawal(recipient, randomAddress(), withdrawalAmount, 0);

      await expect(withdrawTx).to.be.revertedWithPanic(0x11);
    });
  });

  describe('Verify pause and unpause', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const pauserRole = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes('PAUSER_ROLE')
    );

    it('Should be able to grant pauser role', async () => {
      expect(
        await env.fuelERC20Gateway.hasRole(pauserRole, env.addresses[2])
      ).to.equal(false);

      // Grant pauser role
      await expect(env.fuelERC20Gateway.grantRole(pauserRole, env.addresses[2]))
        .to.not.be.reverted;
      expect(
        await env.fuelERC20Gateway.hasRole(pauserRole, env.addresses[2])
      ).to.equal(true);
    });

    it('Should not be able to pause as non-pauser', async () => {
      expect(await env.fuelERC20Gateway.paused()).to.be.equal(false);

      // Attempt pause
      await expect(
        env.fuelERC20Gateway.connect(env.signers[1]).pause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${pauserRole}`
      );
      expect(await env.fuelERC20Gateway.paused()).to.be.equal(false);
    });

    it('Should be able to pause as pauser', async () => {
      expect(await env.fuelERC20Gateway.paused()).to.be.equal(false);

      // Pause
      await expect(env.fuelERC20Gateway.connect(env.signers[2]).pause()).to.not
        .be.reverted;
      expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);
    });

    it('Should not be able to unpause as pauser (and not admin)', async () => {
      expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);

      // Attempt unpause
      await expect(
        env.fuelERC20Gateway.connect(env.signers[2]).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[2].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);
    });

    it('Should not be able to unpause as non-admin', async () => {
      expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);

      // Attempt unpause
      await expect(
        env.fuelERC20Gateway.connect(env.signers[1]).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);
    });

    it('Should not be able to finalize withdrawal when paused', async () => {
      const {
        fuelERC20Gateway,
        token,
        fuelMessagePortalMock,
        addresses: [, , , recipient],
      } = env;

      const impersonatedPortal = await impersonateAccount(
        fuelMessagePortalMock,
        hre
      );

      const withdrawTx = fuelERC20Gateway
        .connect(impersonatedPortal)
        .finalizeWithdrawal(recipient, token.address, 0, 0);

      await expect(withdrawTx).to.be.revertedWith('Pausable: paused');
    });

    it('Should not be able to deposit when paused', async () => {
      await expect(
        env.fuelERC20Gateway.deposit(
          randomBytes32(),
          env.token.address,
          fuelTokenTarget1,
          175
        )
      ).to.be.revertedWith('Pausable: paused');
    });

    it('Should not be able to deposit with data when paused', async () => {
      await expect(
        env.fuelERC20Gateway.depositWithData(
          randomBytes32(),
          env.token.address,
          fuelTokenTarget1,
          205,
          []
        )
      ).to.be.revertedWith('Pausable: paused');
    });

    it('Should be able to unpause as admin', async () => {
      expect(await env.fuelERC20Gateway.paused()).to.be.equal(true);

      // Unpause
      await expect(env.fuelERC20Gateway.unpause()).to.not.be.reverted;
      expect(await env.fuelERC20Gateway.paused()).to.be.equal(false);
    });

    it('Should be able to finalize withdrawal when unpaused', async () => {
      const {
        fuelERC20Gateway,
        token,
        fuelMessagePortalMock,
        addresses: [, , , recipient],
      } = env;

      await fuelMessagePortalMock.setMessageSender(fuelTokenTarget2);

      const impersonatedPortal = await impersonateAccount(
        fuelMessagePortalMock,
        hre
      );

      const withdrawalAmount = 250;
      const withdrawTx = await fuelERC20Gateway
        .connect(impersonatedPortal)
        .finalizeWithdrawal(recipient, token.address, withdrawalAmount, 0);

      await expect(withdrawTx).to.changeTokenBalances(
        token,
        [recipient, fuelERC20Gateway],
        [withdrawalAmount, -withdrawalAmount]
      );
    });

    it('Should be able to revoke pauser role', async () => {
      const {
        fuelERC20Gateway,
        addresses: [, , grantee],
      } = env;

      // Revoke pauser role
      await fuelERC20Gateway.revokeRole(pauserRole, grantee);

      expect(await fuelERC20Gateway.hasRole(pauserRole, grantee)).to.equal(
        false
      );
    });
  });

  describe('rescueETH()', async () => {
    it('Should allow to withdraw ETH sent by accident', async () => {
      const { token, fuelERC20Gateway, deployer } = env;
      const value = utils.parseEther('1'); // forwarded ether by accident
      const depositAmount = 320;
      const recipient = randomBytes32();

      await expect(() =>
        fuelERC20Gateway.deposit(
          recipient,
          token.address,
          fuelTokenTarget2,
          depositAmount,
          { value }
        )
      ).to.changeEtherBalance(fuelERC20Gateway, value);
      await expect(() =>
        fuelERC20Gateway.connect(deployer).rescueETH()
      ).to.changeEtherBalance(deployer, value);
    });

    it('Should reject non-admin calls', async () => {
      const mallory = env.signers[1];
      const malloryAddr = (await mallory.getAddress()).toLowerCase();
      const defaultAdminRole = constants.HashZero;
      const error = `AccessControl: account ${malloryAddr} is missing role ${defaultAdminRole}`;
      await expect(
        env.fuelERC20Gateway.connect(mallory).rescueETH()
      ).to.be.revertedWith(error);
    });
  });
});
