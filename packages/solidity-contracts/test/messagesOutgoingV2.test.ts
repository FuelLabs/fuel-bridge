import type { Provider } from '@ethersproject/abstract-provider';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import { BigNumber as BN, constants } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { deployments, ethers, upgrades } from 'hardhat';

import { randomBytes, randomBytes32 } from '../protocol/utils';
import type { FuelChainState, FuelMessagePortalV2 } from '../typechain';
import { FuelMessagePortalV2__factory } from '../typechain';
import type { MessageTester } from '../typechain/MessageTester';

import { addressToB256 } from './utils/addressConversion';

const { expect } = chai;

const ETH_DECIMALS = 18;
const FUEL_BASE_ASSET_DECIMALS = 9;
const BASE_ASSET_CONVERSION = 10 ** (ETH_DECIMALS - FUEL_BASE_ASSET_DECIMALS);

describe('FuelMessagesPortalV2 - Outgoing messages', async () => {
  const nonceList: string[] = [];

  let signers: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let addresses: string[];

  // Testing contracts
  let messageTester: MessageTester;
  let fuelMessagePortal: FuelMessagePortalV2;
  let fuelChainState: FuelChainState;

  let provider: Provider;

  const fixture = deployments.createFixture(
    async ({ ethers, upgrades: { deployProxy } }) => {
      const provider = ethers.provider;
      const signers = await ethers.getSigners();
      const [deployer] = signers;

      const proxyOptions = {
        initializer: 'initialize',
      };

      const fuelChainState = await ethers
        .getContractFactory('FuelChainState', deployer)
        .then(
          (factory) =>
            deployProxy(factory, [], proxyOptions) as Promise<FuelChainState>
        );

      const fuelMessagePortal = await ethers
        .getContractFactory('FuelMessagePortal', deployer)
        .then((factory) =>
          deployProxy(factory, [fuelChainState.address], proxyOptions)
        )
        .then(({ address }) =>
          FuelMessagePortalV2__factory.connect(address, deployer)
        );

      const V2Implementation = await ethers.getContractFactory(
        'FuelMessagePortalV2'
      );

      const messageTester = await ethers
        .getContractFactory('MessageTester', deployer)
        .then(
          (factory) =>
            factory.deploy(fuelMessagePortal.address) as Promise<MessageTester>
        );

      await signers[0].sendTransaction({
        to: messageTester.address,
        value: parseEther('2'),
      });

      await upgrades.upgradeProxy(fuelMessagePortal, V2Implementation, {
        call: {
          fn: 'initializeV2',
          args: [constants.MaxUint256, constants.MaxUint256],
        },
      });

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

  // Intentionally skipped, since this is tested in `messagesIncomingV2.test.ts`
  // it('can upgrade from V1', async () => {});

  describe('Behaves like V2 - Access control', () => {
    beforeEach('fixture', async () => {
      const fixt = await fixture();
      ({
        messageTester,
        provider,
        addresses,
        fuelMessagePortal,
        fuelChainState,
        signers,
        deployer,
      } = fixt);
    });

    it('allows to set a global deposit limit', async () => {
      const limit = parseEther(Math.random().toFixed(ETH_DECIMALS));
      await fuelMessagePortal.connect(deployer).setGlobalDepositLimit(limit);

      expect(await fuelMessagePortal.depositLimitGlobal()).equal(limit);
    });
    it('allows to set a per account deposit limit', async () => {
      const limit = parseEther(Math.random().toFixed(ETH_DECIMALS));
      await fuelMessagePortal
        .connect(deployer)
        .setPerAccountDepositLimit(limit);

      expect(await fuelMessagePortal.depositLimitPerAccount()).equal(limit);
    });
    it('allows to rescue ETH', async () => {
      const value = parseEther(Math.random().toFixed(FUEL_BASE_ASSET_DECIMALS));
      await fuelMessagePortal
        .connect(signers[0])
        .depositETH(randomBytes32(), { value });

      const tx = fuelMessagePortal.connect(deployer).rescueETH(value);
      await expect(tx).not.to.be.reverted;
      await expect(tx).to.changeEtherBalances(
        [deployer.address, fuelMessagePortal.address],
        [value, value.mul(-1)]
      );
    });

    it('reverts on unauthorized call to setGlobalDepositLimit()', async () => {
      const defaultAdminRole = await fuelMessagePortal.DEFAULT_ADMIN_ROLE();
      const mallory = signers[1];
      const revertTx = fuelMessagePortal
        .connect(mallory)
        .setGlobalDepositLimit(0);

      const expectedErrorMsg = `AccessControl: account ${mallory.address.toLowerCase()} is missing role ${defaultAdminRole}`;
      await expect(revertTx).to.be.revertedWith(expectedErrorMsg);
    });
    it('reverts on unauthorized call to setPerAccountDepositLimit()', async () => {
      const defaultAdminRole = await fuelMessagePortal.DEFAULT_ADMIN_ROLE();
      const mallory = signers[1];
      const revertTx = fuelMessagePortal
        .connect(mallory)
        .setPerAccountDepositLimit(0);

      const expectedErrorMsg = `AccessControl: account ${mallory.address.toLowerCase()} is missing role ${defaultAdminRole}`;
      await expect(revertTx).to.be.revertedWith(expectedErrorMsg);
    });
    it('reverts on unauthorized call to rescueETH()', async () => {
      const defaultAdminRole = await fuelMessagePortal.DEFAULT_ADMIN_ROLE();
      const mallory = signers[1];
      const revertTx = fuelMessagePortal.connect(mallory).rescueETH(0);

      const expectedErrorMsg = `AccessControl: account ${mallory.address.toLowerCase()} is missing role ${defaultAdminRole}`;
      await expect(revertTx).to.be.revertedWith(expectedErrorMsg);
    });
  });

  describe('Behaves like V2 - Accounting', () => {
    beforeEach('fixture', async () => {
      const fixt = await fixture();
      ({
        messageTester,
        provider,
        addresses,
        fuelMessagePortal,
        fuelChainState,
        signers,
        deployer,
      } = fixt);
    });

    it('should track the amount of deposited ether', async () => {
      const recipient = randomBytes32();
      const value = parseEther('1');
      {
        const sender = signers[1];
        const tx = fuelMessagePortal
          .connect(sender)
          .depositETH(recipient, { value });

        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances(
          [sender.address, fuelMessagePortal.address],
          [value.mul(-1), value]
        );

        expect(await fuelMessagePortal.depositedAmounts(sender.address)).equal(
          value
        );
        expect(await fuelMessagePortal.totalDeposited()).equal(value);
      }

      {
        const sender = signers[2];
        const tx = fuelMessagePortal
          .connect(sender)
          .depositETH(recipient, { value });

        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances(
          [sender.address, fuelMessagePortal.address],
          [value.mul(-1), value]
        );

        expect(await fuelMessagePortal.depositedAmounts(sender.address)).equal(
          value
        );
        expect(await fuelMessagePortal.totalDeposited()).equal(value.mul(2));
      }
    });
    it('should revert if the per account limit is reached', async () => {
      const accountLimit = parseEther('1');
      await fuelMessagePortal
        .connect(deployer)
        .setPerAccountDepositLimit(accountLimit);

      const recipient = randomBytes32();
      const sender = signers[1];
      await fuelMessagePortal
        .connect(sender)
        .depositETH(recipient, { value: accountLimit });

      const revertTx = fuelMessagePortal
        .connect(sender)
        .depositETH(recipient, { value: 1 });

      await expect(revertTx).to.be.revertedWithCustomError(
        fuelMessagePortal,
        'AccountDepositLimit'
      );
    });
    it('should revert if the global limit is reached', async () => {
      const globalLimit = parseEther('1');
      await fuelMessagePortal
        .connect(deployer)
        .setGlobalDepositLimit(globalLimit);

      const recipient = randomBytes32();
      const sender = signers[1];
      await fuelMessagePortal
        .connect(sender)
        .depositETH(recipient, { value: globalLimit });

      const revertTx = fuelMessagePortal
        .connect(sender)
        .depositETH(recipient, { value: 1 });

      await expect(revertTx).to.be.revertedWithCustomError(
        fuelMessagePortal,
        'GlobalDepositLimit'
      );
    });
  });

  describe('Behaves like V1 - Send messages', async () => {
    before(async () => {
      const fixt = await fixture();
      ({
        messageTester,
        provider,
        addresses,
        fuelMessagePortal,
        fuelChainState,
      } = fixt);

      // Verify contract getters
      expect(await fuelMessagePortal.fuelChainStateContract()).to.equal(
        fuelChainState.address
      );
      expect(await messageTester.fuelMessagePortal()).to.equal(
        fuelMessagePortal.address
      );
    });

    it('Should be able to send message with data', async () => {
      const recipient = randomBytes32();
      const data = randomBytes(16);
      await expect(messageTester.attemptSendMessage(recipient, data)).to.not.be
        .reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({
        address: fuelMessagePortal.address,
      });
      const messageSentEvent = fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent.name).to.equal('MessageSent');
      expect(messageSentEvent.args.sender).to.equal(
        addressToB256(messageTester.address).toLowerCase()
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
      await expect(messageTester.attemptSendMessage(recipient, [])).to.not.be
        .reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({
        address: fuelMessagePortal.address,
      });
      const messageSentEvent = fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent.name).to.equal('MessageSent');
      expect(messageSentEvent.args.sender).to.equal(
        messageTester.address
          .split('0x')
          .join('0x000000000000000000000000')
          .toLowerCase()
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
      const data = randomBytes(8);
      const portalBalance = await provider.getBalance(
        fuelMessagePortal.address
      );
      await expect(
        messageTester.attemptSendMessageWithAmount(
          recipient,
          ethers.utils.parseEther('0.1'),
          data
        )
      ).to.not.be.reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({
        address: fuelMessagePortal.address,
      });
      const messageSentEvent = fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent.name).to.equal('MessageSent');
      expect(messageSentEvent.args.sender).to.equal(
        messageTester.address
          .split('0x')
          .join('0x000000000000000000000000')
          .toLowerCase()
      );
      expect(messageSentEvent.args.recipient).to.equal(recipient);
      expect(messageSentEvent.args.data).to.equal(data);
      expect(messageSentEvent.args.amount).to.equal(
        ethers.utils.parseEther('0.1').div(BASE_ASSET_CONVERSION)
      );

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent.args.nonce);
      nonceList.push(messageSentEvent.args.nonce);

      // Check that portal balance increased
      expect(await provider.getBalance(fuelMessagePortal.address)).to.equal(
        portalBalance.add(ethers.utils.parseEther('0.1'))
      );
    });

    it('Should be able to send message with amount and without data', async () => {
      const recipient = randomBytes32();
      const portalBalance = await provider.getBalance(
        fuelMessagePortal.address
      );
      await expect(
        messageTester.attemptSendMessageWithAmount(
          recipient,
          ethers.utils.parseEther('0.5'),
          []
        )
      ).to.not.be.reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({
        address: fuelMessagePortal.address,
      });
      const messageSentEvent = fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent.name).to.equal('MessageSent');
      expect(messageSentEvent.args.sender).to.equal(
        messageTester.address
          .split('0x')
          .join('0x000000000000000000000000')
          .toLowerCase()
      );
      expect(messageSentEvent.args.recipient).to.equal(recipient);
      expect(messageSentEvent.args.data).to.equal('0x');
      expect(messageSentEvent.args.amount).to.equal(
        ethers.utils.parseEther('0.5').div(BASE_ASSET_CONVERSION)
      );

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent.args.nonce);
      nonceList.push(messageSentEvent.args.nonce);

      // Check that portal balance increased
      expect(await provider.getBalance(fuelMessagePortal.address)).to.equal(
        portalBalance.add(ethers.utils.parseEther('0.5'))
      );
    });

    it('Should not be able to send message with amount too small', async () => {
      const recipient = randomBytes32();
      await expect(
        fuelMessagePortal.sendMessage(recipient, [], {
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

      const maxUint64 = BN.from('0xffffffffffffffff');
      const precision = 10 ** 9;

      const maxAllowedValue = maxUint64.mul(precision);
      await fuelMessagePortal.sendMessage(recipient, [], {
        value: maxAllowedValue,
      });

      const minUnallowedValue = maxUint64.add(1).mul(precision);
      await expect(
        fuelMessagePortal.sendMessage(recipient, [], {
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
          value: ethers.utils.parseEther('1.234'),
        })
      ).to.not.be.reverted;

      // Check logs for message sent
      const logs = await provider.getLogs({
        address: fuelMessagePortal.address,
      });
      const messageSentEvent = fuelMessagePortal.interface.parseLog(
        logs[logs.length - 1]
      );
      expect(messageSentEvent.name).to.equal('MessageSent');
      expect(messageSentEvent.args.sender).to.equal(
        addresses[0]
          .split('0x')
          .join('0x000000000000000000000000')
          .toLowerCase()
      );
      expect(messageSentEvent.args.recipient).to.equal(recipient);
      expect(messageSentEvent.args.data).to.equal('0x');
      expect(messageSentEvent.args.amount).to.equal(
        ethers.utils.parseEther('1.234').div(BASE_ASSET_CONVERSION)
      );

      // Check that nonce is unique
      expect(nonceList).to.not.include(messageSentEvent.args.nonce);
      nonceList.push(messageSentEvent.args.nonce);
    });
  });
});
