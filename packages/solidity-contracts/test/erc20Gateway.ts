import chai from 'chai';
import type { BigNumberish } from 'ethers';
import {
  ZeroAddress,
  ZeroHash,
  keccak256,
  parseEther,
  toUtf8Bytes,
  zeroPadValue,
} from 'ethers';
import hre from 'hardhat';

import type { HarnessObject } from '../protocol/harness';
import { randomAddress, randomBytes32 } from '../protocol/utils';
import type {
  CRY,
  FuelERC20Gateway,
  MockFuelMessagePortal,
  Token,
} from '../typechain';

import { impersonateAccount } from './utils/impersonateAccount';

const { expect } = chai;
const { deployments } = hre;

type Fixture = Pick<
  HarnessObject,
  | 'token'
  | 'fuelERC20Gateway'
  | 'addresses'
  | 'signers'
  | 'deployer'
  | 'initialTokenAmount'
> & {
  fuelMessagePortalMock: MockFuelMessagePortal;
  CRY: CRY;
  initialCRYAmount: bigint;
};

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

    const FuelERC20Gateway = await hre.ethers.getContractFactory(
      'FuelERC20Gateway',
      deployer
    );

    const fuelERC20Gateway = (await hre.upgrades
      .deployProxy(
        FuelERC20Gateway,
        [await fuelMessagePortalMock.getAddress()],
        { initializer: 'initialize' }
      )
      .then((tx) => tx.waitForDeployment())) as FuelERC20Gateway;

    const initialTokenAmount = parseEther('1000000');
    for (let i = 0; i < signers.length; i += 1) {
      await token.mint(signers[i], initialTokenAmount);
    }

    await token
      .connect(signers[0])
      .approve(fuelERC20Gateway, initialTokenAmount);

    const CRY = await hre.ethers
      .getContractFactory('CRY', deployer)
      .then((factory) => factory.deploy() as Promise<CRY>);

    const initialCRYAmount = parseEther('1000000');
    for (let i = 0; i < signers.length; i += 1) {
      await CRY.mint(signers[i], initialCRYAmount);
    }

    await CRY.connect(signers[0]).approve(fuelERC20Gateway, initialCRYAmount);

    return {
      token,
      CRY,
      fuelMessagePortalMock,
      fuelERC20Gateway,
      addresses,
      signers,
      deployer,
      initialTokenAmount,
      initialCRYAmount,
    };
  });

  before(async () => {
    env = await fixture();
  });

  describe('Make both valid and invalid ERC20 deposits', async () => {
    it('Should not be able to deposit zero', async () => {
      const { token, fuelERC20Gateway } = env;

      const previousBalance = await token.balanceOf(fuelERC20Gateway);

      // Attempt deposit
      await expect(
        fuelERC20Gateway.deposit(randomBytes32(), token, fuelTokenTarget1, 0)
      ).to.be.revertedWith('Cannot deposit zero');

      const newBalance = await token.balanceOf(fuelERC20Gateway);
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
        const depositTx = fuelERC20Gateway.deposit(
          depositRecipient,
          token,
          fuelTokenTarget,
          depositAmount
        );

        const senderAddress = (await depositTx).from.toLowerCase();

        await expect(depositTx)
          .to.emit(fuelERC20Gateway, 'Deposit')
          .withArgs(
            zeroPadValue(senderAddress, 32),
            token,
            fuelTokenTarget,
            depositAmount
          );

        await expect(depositTx).to.changeTokenBalance(
          token,
          fuelERC20Gateway,
          depositAmount
        );
      }
    });

    it('Should be able to deposit tokens with data', async () => {
      const { fuelERC20Gateway, token } = env;

      const depositRecipient = randomBytes32();
      const depositData = new Uint8Array([3, 2, 6, 9, 2, 5]);
      const depositAmount = 85;

      const depositTx = fuelERC20Gateway.depositWithData(
        depositRecipient,
        token,
        fuelTokenTarget1,
        depositAmount,
        depositData
      );

      const senderAddress = (await depositTx).from.toLowerCase();

      await expect(depositTx)
        .to.emit(fuelERC20Gateway, 'Deposit')
        .withArgs(
          zeroPadValue(senderAddress, 32),
          token,
          fuelTokenTarget1,
          depositAmount
        );

      await expect(depositTx).to.changeTokenBalance(
        token,
        fuelERC20Gateway,
        depositAmount
      );
    });

    it('Should be able to deposit tokens with empty data', async () => {
      const { fuelERC20Gateway, token } = env;

      const depositRecipient = randomBytes32();
      const depositData = new Uint8Array([]);
      const depositAmount = 85;

      const depositTx = fuelERC20Gateway.depositWithData(
        depositRecipient,
        token,
        fuelTokenTarget1,
        depositAmount,
        depositData
      );

      const senderAddress = (await depositTx).from.toLowerCase();

      await expect(depositTx)
        .to.emit(fuelERC20Gateway, 'Deposit')
        .withArgs(
          zeroPadValue(senderAddress, 32),
          token,
          fuelTokenTarget1,
          depositAmount
        );

      await expect(depositTx).to.changeTokenBalance(
        token,
        fuelERC20Gateway,
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
        env.fuelERC20Gateway.finalizeWithdrawal(to, token, 100n, ZeroHash)
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
        .finalizeWithdrawal(recipient, token, withdrawalAmount, 0);

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
        .finalizeWithdrawal(recipient, token, withdrawalAmount, 0);

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
        token,
        fuelTokenTarget1
      );
      const impersonatedPortal = await impersonateAccount(
        fuelMessagePortalMock,
        hre
      );

      await fuelERC20Gateway
        .connect(impersonatedPortal)
        .finalizeWithdrawal.staticCall(recipient, token, withdrawableAmount, 0);

      const withdrawTx = fuelERC20Gateway
        .connect(impersonatedPortal)
        .finalizeWithdrawal(recipient, token, withdrawableAmount + 1n, 0);

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
        .finalizeWithdrawal(recipient, token, 0, 0);

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
        await fuelERC20Gateway.tokensDeposited(token, L2Token)
      ).to.be.equal(0);

      await fuelMessagePortalMock.setMessageSender(L2Token);
      const withdrawalAmount = 1;
      const impersonatedPortal = await impersonateAccount(
        fuelMessagePortalMock,
        hre
      );

      const withdrawTx = fuelERC20Gateway
        .connect(impersonatedPortal)
        .finalizeWithdrawal(recipient, token, withdrawalAmount, 0);

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
    const pauserRole = keccak256(toUtf8Bytes('PAUSER_ROLE'));

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
        .finalizeWithdrawal(recipient, token, 0, 0);

      await expect(withdrawTx).to.be.revertedWith('Pausable: paused');
    });

    it('Should not be able to deposit when paused', async () => {
      await expect(
        env.fuelERC20Gateway.deposit(
          randomBytes32(),
          env.token,
          fuelTokenTarget1,
          175
        )
      ).to.be.revertedWith('Pausable: paused');
    });

    it('Should not be able to deposit with data when paused', async () => {
      await expect(
        env.fuelERC20Gateway.depositWithData(
          randomBytes32(),
          env.token,
          fuelTokenTarget1,
          205,
          new Uint8Array([])
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
        .finalizeWithdrawal(recipient, token, withdrawalAmount, 0);

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
      const value = parseEther('1'); // forwarded ether by accident
      const depositAmount = 320;
      const recipient = randomBytes32();

      await expect(() =>
        fuelERC20Gateway.deposit(
          recipient,
          token,
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
      const defaultAdminRole = ZeroHash;
      const error = `AccessControl: account ${malloryAddr} is missing role ${defaultAdminRole}`;
      await expect(
        env.fuelERC20Gateway.connect(mallory).rescueETH()
      ).to.be.revertedWith(error);
    });
  });

  describe('CRY Token', () => {
    let env: Fixture;
    let cryToken: CRY;

    before(async () => {
      env = await fixture();
      cryToken = env.CRY;
    });

    it('should have the correct name and symbol', async () => {
      expect(await cryToken.name()).to.equal('Cry Coin');
      expect(await cryToken.symbol()).to.equal('CRY');
    });

    it('should have 6 decimals', async () => {
      expect(await cryToken.decimals()).to.equal(6);
    });

    it('should mint tokens correctly', async () => {
      const [, recipient] = env.signers;
      const mintAmount = parseEther('1000');

      await cryToken.mint(recipient.address, mintAmount);

      expect(await cryToken.balanceOf(recipient.address)).to.equal(
        env.initialCRYAmount + mintAmount
      );
    });

    it('should allow anyone to mint tokens', async () => {
      const [, , randomSigner] = env.signers;
      const mintAmount = parseEther('500');

      await cryToken
        .connect(randomSigner)
        .mint(randomSigner.address, mintAmount);

      expect(await cryToken.balanceOf(randomSigner.address)).to.equal(
        env.initialCRYAmount + mintAmount
      );
    });

    it('should emit Transfer event when minting', async () => {
      const mintAmount = parseEther('100');
      const recipient = env.signers[4];

      await expect(
        cryToken.connect(env.deployer).mint(recipient.address, mintAmount)
      )
        .to.emit(cryToken, 'Transfer')
        .withArgs(ZeroAddress, recipient.address, mintAmount);
    });

    it('should work with the FuelERC20Gateway', async () => {
      const depositAmount = parseEther('1000');
      const fuelTokenId = randomBytes32();

      await cryToken.approve(
        await env.fuelERC20Gateway.getAddress(),
        depositAmount
      );

      console.log(
        'fsk',
        await cryToken.getAddress(),
        await env.deployer.getAddress(),
        fuelTokenId,
        depositAmount
      );
      await expect(
        env.fuelERC20Gateway.deposit(
          fuelTokenId,
          cryToken,
          fuelTokenTarget1,
          depositAmount
        )
      )
        .to.emit(env.fuelERC20Gateway, 'Deposit')
        .withArgs(
          zeroPadValue(await env.deployer.getAddress(), 32),
          await cryToken.getAddress(),
          fuelTokenTarget1,
          depositAmount
        );
    });
  });
});
