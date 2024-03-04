import chai from 'chai';
import type { Provider } from 'ethers';
import {
  hexlify,
  keccak256,
  parseEther,
  randomBytes,
  toUtf8Bytes,
  zeroPadValue,
} from 'ethers';
import { ethers } from 'hardhat';

import type { HarnessObject } from '../protocol/harness';
import { setupFuel } from '../protocol/harness';
import { randomBytes32 } from '../protocol/utils';
import type { MessageTester } from '../typechain';

const { expect } = chai;

describe('Outgoing Messages', async () => {
  let env: HarnessObject;
  const nonceList: string[] = [];

  // Testing contracts
  let messageTester: MessageTester;
  let messageTesterAddress: string;
  let fuelMessagePortalAddress: string;

  before(async () => {
    env = await setupFuel();
    fuelMessagePortalAddress = await env.fuelMessagePortal.getAddress();

    // Deploy contracts for message testing
    messageTester = (await ethers
      .getContractFactory('MessageTester', env.deployer)
      .then(async (factory) => factory.deploy(env.fuelMessagePortal))
      .then((tx) => tx.waitForDeployment())) as MessageTester;
    messageTesterAddress = await messageTester.getAddress();

    // Send eth to contract
    const tx = {
      to: messageTester,
      value: parseEther('2'),
    };
    const transaction = await env.signers[0].sendTransaction(tx);
    await transaction.wait();

    // Verify contract getters
    expect(await env.fuelMessagePortal.fuelChainStateContract()).to.equal(
      await env.fuelChainState.getAddress()
    );
    expect(await messageTester.fuelMessagePortal()).to.equal(
      fuelMessagePortalAddress
    );
  });

  describe('Verify access control', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const pauserRole = keccak256(toUtf8Bytes('PAUSER_ROLE'));
    let signer0: string;
    let signer1: string;
    let signer2: string;
    before(async () => {
      signer0 = env.addresses[0];
      signer1 = env.addresses[1];
      signer2 = env.addresses[2];
    });

    it('Should be able to grant admin role', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)
      ).to.equal(false);

      // Grant admin role
      await expect(env.fuelMessagePortal.grantRole(defaultAdminRole, signer1))
        .to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)
      ).to.equal(true);
    });

    it('Should be able to renounce admin role', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(true);

      // Revoke admin role
      await expect(
        env.fuelMessagePortal.renounceRole(defaultAdminRole, signer0)
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
    });

    it('Should not be able to grant admin role as non-admin', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);

      // Attempt grant admin role
      await expect(
        env.fuelMessagePortal.grantRole(defaultAdminRole, signer0)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[0].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
    });

    it('Should be able to grant then revoke admin role', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)
      ).to.equal(true);

      // Grant admin role
      await expect(
        env.fuelMessagePortal
          .connect(env.signers[1])
          .grantRole(defaultAdminRole, signer0)
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)
      ).to.equal(true);

      // Revoke previous admin
      await expect(env.fuelMessagePortal.revokeRole(defaultAdminRole, signer1))
        .to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)
      ).to.equal(false);
    });

    it('Should be able to grant pauser role', async () => {
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(
        false
      );

      // Grant pauser role
      await expect(env.fuelMessagePortal.grantRole(pauserRole, signer1)).to.not
        .be.reverted;
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(
        true
      );
    });

    it('Should not be able to grant permission as pauser', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer2)
      ).to.equal(false);
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer2)).to.equal(
        false
      );

      // Attempt grant admin role
      await expect(
        env.fuelMessagePortal
          .connect(env.signers[1])
          .grantRole(defaultAdminRole, signer2)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(
        await env.fuelMessagePortal.hasRole(defaultAdminRole, signer2)
      ).to.equal(false);

      // Attempt grant pauser role
      await expect(
        env.fuelMessagePortal
          .connect(env.signers[1])
          .grantRole(pauserRole, signer2)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer2)).to.equal(
        false
      );
    });

    it('Should be able to revoke pauser role', async () => {
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(
        true
      );

      // Grant pauser role
      await expect(env.fuelMessagePortal.revokeRole(pauserRole, signer1)).to.not
        .be.reverted;
      expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(
        false
      );
    });
  });

  describe('Send messages', async () => {
    let provider: Provider;
    let filterAddress: string;
    let fuelBaseAssetDecimals: bigint;
    let baseAssetConversion: bigint;

    before(async () => {
      provider = env.deployer.provider;
      filterAddress = fuelMessagePortalAddress;
      fuelBaseAssetDecimals =
        await env.fuelMessagePortal.fuelBaseAssetDecimals();
      baseAssetConversion = 10n ** (18n - fuelBaseAssetDecimals);
    });

    it('Should be able to send message with data', async () => {
      const recipient = randomBytes32();
      const data = hexlify(randomBytes(16));
      await expect(messageTester.attemptSendMessage(recipient, data)).to.not.be
        .reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({ address: filterAddress });
      const messageSentEvent = env.fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent.name).to.equal('MessageSent');
      expect(messageSentEvent.args.sender).to.equal(
        zeroPadValue(messageTesterAddress, 32).toLowerCase()
      );
      expect(messageSentEvent.args.recipient).to.equal(recipient);
      expect(messageSentEvent.args.data).to.equal(data);
      expect(messageSentEvent.args.amount).to.equal(0);

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent.args.nonce);
      nonceList.push(messageSentEvent.args.nonce);
    });

    it('Should be able to send message without data', async () => {
      const recipient = randomBytes32();
      await expect(
        messageTester.attemptSendMessage(recipient, new Uint8Array([]))
      ).to.not.be.reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({ address: filterAddress });
      const messageSentEvent = env.fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent.name).to.equal('MessageSent');
      expect(messageSentEvent.args.sender).to.equal(
        zeroPadValue(messageTesterAddress, 32)
      );
      expect(messageSentEvent.args.recipient).to.equal(recipient);
      expect(messageSentEvent.args.data).to.equal('0x');
      expect(messageSentEvent.args.amount).to.equal(0);

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent.args.nonce);
      nonceList.push(messageSentEvent.args.nonce);
    });

    it('Should be able to send message with amount and data', async () => {
      const recipient = randomBytes32();
      const data = hexlify(randomBytes(8));
      const portalBalance = await provider.getBalance(env.fuelMessagePortal);
      await expect(
        messageTester.attemptSendMessageWithAmount(
          recipient,
          parseEther('0.1'),
          data
        )
      ).to.not.be.reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({ address: filterAddress });
      const messageSentEvent = env.fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent.name).to.equal('MessageSent');
      expect(messageSentEvent.args.sender).to.equal(
        zeroPadValue(messageTesterAddress, 32)
      );
      expect(messageSentEvent.args.recipient).to.equal(recipient);
      expect(messageSentEvent.args.data).to.equal(data);
      expect(messageSentEvent.args.amount).to.equal(
        parseEther('0.1') / baseAssetConversion
      );

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent.args.nonce);
      nonceList.push(messageSentEvent.args.nonce);

      // Check that portal balance increased
      expect(await provider.getBalance(env.fuelMessagePortal)).to.equal(
        portalBalance + parseEther('0.1')
      );
    });

    it('Should be able to send message with amount and without data', async () => {
      const recipient = randomBytes32();
      const portalBalance = await provider.getBalance(env.fuelMessagePortal);
      await expect(
        messageTester.attemptSendMessageWithAmount(
          recipient,
          parseEther('0.5'),
          new Uint8Array([])
        )
      ).to.not.be.reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({ address: filterAddress });
      const messageSentEvent = env.fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent.name).to.equal('MessageSent');
      expect(messageSentEvent.args.sender).to.equal(
        zeroPadValue(messageTesterAddress, 32).toLowerCase()
      );
      expect(messageSentEvent.args.recipient).to.equal(recipient);
      expect(messageSentEvent.args.data).to.equal('0x');
      expect(messageSentEvent.args.amount).to.equal(
        parseEther('0.5') / baseAssetConversion
      );

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent.args.nonce);
      nonceList.push(messageSentEvent.args.nonce);

      // Check that portal balance increased
      expect(await provider.getBalance(env.fuelMessagePortal)).to.equal(
        portalBalance + parseEther('0.5')
      );
    });

    it('Should not be able to send message with amount too small', async () => {
      const recipient = randomBytes32();
      await expect(
        env.fuelMessagePortal.sendMessage(recipient, new Uint8Array([]), {
          value: 1,
        })
      ).to.be.revertedWithCustomError(
        env.fuelMessagePortal,
        'AmountPrecisionIncompatibility'
      );
    });

    it('Should not be able to send message with amount too big', async () => {
      const recipient = randomBytes32();
      await ethers.provider.send('hardhat_setBalance', [
        env.addresses[0],
        '0xf00000000000000000000000',
      ]);

      const maxUint64 = BigInt('0xffffffffffffffff');
      const precision = 10n ** 9n;

      const maxAllowedValue = maxUint64 * precision;
      await env.fuelMessagePortal.sendMessage(recipient, new Uint8Array([]), {
        value: maxAllowedValue,
      });

      const minUnallowedValue = (maxUint64 + 1n) * precision;
      await expect(
        env.fuelMessagePortal.sendMessage(recipient, new Uint8Array([]), {
          value: minUnallowedValue,
        })
      ).to.be.revertedWithCustomError(env.fuelMessagePortal, 'AmountTooBig');
    });
    it('Should not be able to send message with too much data', async () => {
      const recipient = randomBytes32();
      const data = new Uint8Array(65536 + 1);
      await expect(
        env.fuelMessagePortal.sendMessage(recipient, data)
      ).to.be.revertedWithCustomError(
        env.fuelMessagePortal,
        'MessageDataTooLarge'
      );
    });

    it('Should be able to send message with only ETH', async () => {
      const recipient = randomBytes32();
      await expect(
        env.fuelMessagePortal.depositETH(recipient, {
          value: parseEther('1.234'),
        })
      ).to.not.be.reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({ address: filterAddress });
      const messageSentEvent = env.fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent.name).to.equal('MessageSent');
      expect(messageSentEvent.args.sender).to.equal(
        env.addresses[0]
          .split('0x')
          .join('0x000000000000000000000000')
          .toLowerCase()
      );
      expect(messageSentEvent.args.recipient).to.equal(recipient);
      expect(messageSentEvent.args.data).to.equal('0x');
      expect(messageSentEvent.args.amount).to.equal(
        parseEther('1.234') / baseAssetConversion
      );

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent.args.nonce);
      nonceList.push(messageSentEvent.args.nonce);
    });
  });

  describe('Verify pause and unpause', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const pauserRole = keccak256(toUtf8Bytes('PAUSER_ROLE'));
    const recipient = randomBytes32();
    const data = randomBytes(8);

    it('Should be able to grant pauser role', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])
      ).to.equal(false);

      // Grant pauser role
      await expect(
        env.fuelMessagePortal.grantRole(pauserRole, env.addresses[2])
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])
      ).to.equal(true);
    });

    it('Should not be able to pause as non-pauser', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(false);

      // Attempt pause
      await expect(
        env.fuelMessagePortal.connect(env.signers[1]).pause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${pauserRole}`
      );
      expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
    });

    it('Should be able to pause as pauser', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(false);

      // Pause
      await expect(env.fuelMessagePortal.connect(env.signers[2]).pause()).to.not
        .be.reverted;
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
    });

    it('Should not be able to unpause as pauser (and not admin)', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

      // Attempt unpause
      await expect(
        env.fuelMessagePortal.connect(env.signers[2]).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[2].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
    });

    it('Should not be able to unpause as non-admin', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

      // Attempt unpause
      await expect(
        env.fuelMessagePortal.connect(env.signers[1]).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
    });

    it('Should not be able to send messages when paused', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
      await expect(
        env.fuelMessagePortal.sendMessage(recipient, data)
      ).to.be.revertedWith('Pausable: paused');
      await expect(
        env.fuelMessagePortal.depositETH(recipient, { value: 1 })
      ).to.be.revertedWith('Pausable: paused');
    });

    it('Should be able to unpause as admin', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

      // Unpause
      await expect(env.fuelMessagePortal.unpause()).to.not.be.reverted;
      expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
    });

    it('Should be able to send messages when unpaused', async () => {
      expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
      await expect(env.fuelMessagePortal.sendMessage(recipient, data)).to.not.be
        .reverted;
    });

    it('Should be able to revoke pauser role', async () => {
      expect(
        await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])
      ).to.equal(true);

      // Grant pauser role
      await expect(
        env.fuelMessagePortal.revokeRole(pauserRole, env.addresses[2])
      ).to.not.be.reverted;
      expect(
        await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])
      ).to.equal(false);
    });
  });
});
