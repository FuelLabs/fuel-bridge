import chai from 'chai';
import type { Provider } from 'ethers';
import {
  MaxUint256,
  Wallet,
  hexlify,
  parseEther,
  randomBytes,
  zeroPadValue,
} from 'ethers';
import { deployments, ethers, upgrades } from 'hardhat';

import { RATE_LIMIT_AMOUNT, RATE_LIMIT_DURATION } from '../protocol/constants';
import { randomBytes32 } from '../protocol/utils';
import { FuelChainState__factory } from '../typechain';
import type {
  MessageTester,
  FuelChainState,
  FuelMessagePortalV3,
} from '../typechain';

import {
  BLOCKS_PER_COMMIT_INTERVAL,
  COMMIT_COOLDOWN,
  TIME_TO_FINALIZE,
} from './utils';
import { addressToB256 } from './utils/addressConversion';

const { expect } = chai;

const ETH_DECIMALS = 18n;
const FUEL_BASE_ASSET_DECIMALS = 9n;
const BASE_ASSET_CONVERSION = 10n ** (ETH_DECIMALS - FUEL_BASE_ASSET_DECIMALS);

const ETH_GLOBAL_LIMIT = parseEther('20');

const EMPTY_DATA = new Uint8Array([]);

describe.only('FuelMessagesPortalV3 - Outgoing messages', async () => {
  const nonceList: string[] = [];
  let addresses: string[];

  // Testing contracts
  let messageTester: MessageTester;
  let fuelMessagePortal: FuelMessagePortalV3;
  let fuelChainState: FuelChainState;

  let provider: Provider;

  const fixture = deployments.createFixture(
    async (
      { ethers, upgrades: { deployProxy } },
      options?: { globalEthLimit?: bigint; perAccountEthLimit?: bigint }
    ) => {
      const provider = ethers.provider;
      const signers = await ethers.getSigners();
      const [deployer] = signers;

      const proxyOptions = {
        initializer: 'initialize',
      };

      const fuelChainState = (await ethers
        .getContractFactory('FuelChainState', deployer)
        .then(async (factory) =>
          deployProxy(factory, [], {
            ...proxyOptions,
            constructorArgs: [
              TIME_TO_FINALIZE,
              BLOCKS_PER_COMMIT_INTERVAL,
              COMMIT_COOLDOWN,
            ],
          })
        )
        .then((tx) => tx.waitForDeployment())) as FuelChainState;

      const fuelMessagePortalDeployment = await ethers
        .getContractFactory('FuelMessagePortal', deployer)
        .then(async (factory) =>
          deployProxy(
            factory,
            [await fuelChainState.getAddress()],
            proxyOptions
          )
        )
        .then((tx) => tx.waitForDeployment());

      const V2Implementation = await ethers.getContractFactory(
        'FuelMessagePortalV2'
      );
      const V3Implementation = await ethers.getContractFactory(
        'FuelMessagePortalV3'
      );

      const fuelMessagePortal = V2Implementation.attach(
        fuelMessagePortalDeployment
      ).connect(fuelMessagePortalDeployment.runner) as FuelMessagePortalV3;

      const wallet = Wallet.createRandom().connect(deployer.provider);
      FuelChainState__factory.connect(
        await fuelMessagePortal.getAddress(),
        wallet
      );
      const messageTester = (await ethers
        .getContractFactory('MessageTester', deployer)
        .then(async (factory) => factory.deploy(fuelMessagePortal))
        .then((tx) => tx.waitForDeployment())) as MessageTester;

      await signers[0].sendTransaction({
        to: messageTester,
        value: parseEther('2'),
      });

      await upgrades.upgradeProxy(
        fuelMessagePortalDeployment,
        V2Implementation,
        {
          unsafeAllow: ['constructor'],
          constructorArgs: [options?.globalEthLimit || ETH_GLOBAL_LIMIT],
        }
      );

      await upgrades.upgradeProxy(
        fuelMessagePortalDeployment,
        V3Implementation,
        {
          unsafeAllow: ['constructor'],
          constructorArgs: [MaxUint256, RATE_LIMIT_DURATION],
          call: { fn: 'reinitializeV3', args: [RATE_LIMIT_AMOUNT.toString()] },
        }
      );

      return {
        provider,
        deployer,
        signers,
        fuelMessagePortal,
        fuelChainState,
        V2Implementation,
        messageTester,
        addresses: signers.map(({ address }) => address),
      };
    }
  );

  describe('Behaves like V1 - Send messages', async () => {
    let messageTesterAddress: string;

    before(async () => {
      const fixt = await fixture({
        globalEthLimit: MaxUint256,
        perAccountEthLimit: MaxUint256,
      });
      ({
        messageTester,
        provider,
        addresses,
        fuelMessagePortal,
        fuelChainState,
      } = fixt);

      // Verify contract getters
      expect(await fuelMessagePortal.fuelChainStateContract()).to.equal(
        await fuelChainState.getAddress()
      );
      expect(await messageTester.fuelMessagePortal()).to.equal(
        await fuelMessagePortal.getAddress()
      );

      messageTesterAddress = await messageTester.getAddress();
    });

    it('Should be able to send message with data', async () => {
      const recipient = randomBytes32();
      const data = hexlify(randomBytes(16));
      await expect(messageTester.attemptSendMessage(recipient, data)).to.not.be
        .reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({
        address: fuelMessagePortal,
      });
      const messageSentEvent = fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent?.name).to.equal('MessageSent');
      expect(messageSentEvent?.args.sender).to.equal(
        addressToB256(messageTesterAddress).toLowerCase()
      );
      expect(messageSentEvent?.args.recipient).to.equal(recipient);
      expect(messageSentEvent?.args.data).to.equal(data);
      expect(messageSentEvent?.args.amount).to.equal(0);

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent?.args.nonce);
      nonceList.push(messageSentEvent?.args.nonce);
    });

    it('Should be able to send message without data', async () => {
      const recipient = randomBytes32();
      await expect(messageTester.attemptSendMessage(recipient, EMPTY_DATA)).to
        .not.be.reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({
        address: fuelMessagePortal,
      });
      const messageSentEvent = fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent?.name).to.equal('MessageSent');
      expect(messageSentEvent?.args.sender).to.equal(
        zeroPadValue(messageTesterAddress, 32)
      );
      expect(messageSentEvent?.args.recipient).to.equal(recipient);
      expect(messageSentEvent?.args.data).to.equal('0x');
      expect(messageSentEvent?.args.amount).to.equal(0);

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent?.args.nonce);
      nonceList.push(messageSentEvent?.args.nonce);
    });

    it('Should be able to send message with amount and data', async () => {
      const recipient = randomBytes32();
      const data = hexlify(randomBytes(8));
      const portalBalance = await provider.getBalance(fuelMessagePortal);
      await expect(
        messageTester.attemptSendMessageWithAmount(
          recipient,
          parseEther('0.1'),
          data
        )
      ).to.not.be.reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({
        address: fuelMessagePortal,
      });
      const messageSentEvent = fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent?.name).to.equal('MessageSent');
      expect(messageSentEvent?.args.sender).to.equal(
        zeroPadValue(messageTesterAddress, 32)
      );
      expect(messageSentEvent?.args.recipient).to.equal(recipient);
      expect(messageSentEvent?.args.data).to.equal(data);
      expect(messageSentEvent?.args.amount).to.equal(
        parseEther('0.1') / BASE_ASSET_CONVERSION
      );

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent?.args.nonce);
      nonceList.push(messageSentEvent?.args.nonce);

      // Check that portal balance increased
      expect(await provider.getBalance(fuelMessagePortal)).to.equal(
        portalBalance + parseEther('0.1')
      );
    });

    it('Should be able to send message with amount and without data', async () => {
      const recipient = randomBytes32();
      const portalBalance = await provider.getBalance(fuelMessagePortal);
      await expect(
        messageTester.attemptSendMessageWithAmount(
          recipient,
          parseEther('0.5'),
          EMPTY_DATA
        )
      ).to.not.be.reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({
        address: fuelMessagePortal,
      });
      const messageSentEvent = fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent?.name).to.equal('MessageSent');
      expect(messageSentEvent?.args.sender).to.equal(
        zeroPadValue(messageTesterAddress, 32)
      );
      expect(messageSentEvent?.args.recipient).to.equal(recipient);
      expect(messageSentEvent?.args.data).to.equal('0x');
      expect(messageSentEvent?.args.amount).to.equal(
        parseEther('0.5') / BASE_ASSET_CONVERSION
      );

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent?.args.nonce);
      nonceList.push(messageSentEvent?.args.nonce);

      // Check that portal balance increased
      expect(await provider.getBalance(fuelMessagePortal)).to.equal(
        portalBalance + parseEther('0.5')
      );
    });

    it('Should not be able to send message with amount too small', async () => {
      const recipient = randomBytes32();
      await expect(
        fuelMessagePortal.sendMessage(recipient, EMPTY_DATA, {
          value: 1,
        })
      ).to.be.revertedWithCustomError(
        fuelMessagePortal,
        'AmountPrecisionIncompatibility'
      );
    });

    it('Should not be able to send message with amount too big', async () => {
      const recipient = randomBytes32();
      await ethers.provider.send('hardhat_setBalance', [
        addresses[0],
        '0xf00000000000000000000000',
      ]);

      const maxUint64 = BigInt('0xffffffffffffffff');
      const precision = 10n ** 9n;

      const maxAllowedValue = maxUint64 * precision;
      await fuelMessagePortal.sendMessage(recipient, EMPTY_DATA, {
        value: maxAllowedValue,
      });

      const minUnallowedValue = (maxUint64 + 1n) * precision;
      await expect(
        fuelMessagePortal.sendMessage(recipient, EMPTY_DATA, {
          value: minUnallowedValue,
        })
      ).to.be.revertedWithCustomError(fuelMessagePortal, 'AmountTooBig');
    });
    it('Should not be able to send message with too much data', async () => {
      const recipient = randomBytes32();
      const data = new Uint8Array(65536 + 1);
      await expect(
        fuelMessagePortal.sendMessage(recipient, data)
      ).to.be.revertedWithCustomError(fuelMessagePortal, 'MessageDataTooLarge');
    });

    it('Should be able to send message with only ETH', async () => {
      const recipient = randomBytes32();
      await expect(
        fuelMessagePortal.depositETH(recipient, {
          value: parseEther('1.234'),
        })
      ).to.not.be.reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({
        address: fuelMessagePortal,
      });
      const messageSentEvent = fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent?.name).to.equal('MessageSent');
      expect(messageSentEvent?.args.sender).to.equal(
        zeroPadValue(addresses[0], 32)
      );
      expect(messageSentEvent?.args.recipient).to.equal(recipient);
      expect(messageSentEvent?.args.data).to.equal('0x');
      expect(messageSentEvent?.args.amount).to.equal(
        parseEther('1.234') / BASE_ASSET_CONVERSION
      );

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent?.args.nonce);
      nonceList.push(messageSentEvent?.args.nonce);
    });
  });
});
