import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { BigNumber as BN } from 'ethers';
import { Provider } from '@ethersproject/abstract-provider';
import { MessageTester } from '../typechain/MessageTester.d';
import { HarnessObject, setupFuel } from '../protocol/harness';
import { randomBytes, randomBytes32 } from '../protocol/utils';

chai.use(solidity);
const { expect } = chai;

describe('Outgoing Messages', async () => {
    let env: HarnessObject;
    const nonceList: string[] = [];

    // Testing contracts
    let messageTester: MessageTester;

    before(async () => {
        env = await setupFuel();

        // Deploy contracts for message testing
        const messageTesterContractFactory = await ethers.getContractFactory('MessageTester');
        messageTester = (await messageTesterContractFactory.deploy(env.fuelMessagePortal.address)) as MessageTester;
        await messageTester.deployed();

        // Send eth to contract
        const tx = {
            to: messageTester.address,
            value: ethers.utils.parseEther('2'),
        };
        const transaction = await env.signers[0].sendTransaction(tx);
        await transaction.wait();

        // Verify contract getters
        expect(await env.fuelMessagePortal.fuelChainStateContract()).to.equal(env.fuelChainState.address);
        expect(await messageTester.fuelMessagePortal()).to.equal(env.fuelMessagePortal.address);
    });

    describe('Verify access control', async () => {
        const defaultAdminRole = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const pauserRole = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('PAUSER_ROLE'));
        let signer0: string;
        let signer1: string;
        let signer2: string;
        before(async () => {
            signer0 = env.addresses[0];
            signer1 = env.addresses[1];
            signer2 = env.addresses[2];
        });

        it('Should be able to grant admin role', async () => {
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)).to.equal(false);

            // Grant admin role
            await expect(env.fuelMessagePortal.grantRole(defaultAdminRole, signer1)).to.not.be.reverted;
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)).to.equal(true);
        });

        it('Should be able to renounce admin role', async () => {
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)).to.equal(true);

            // Revoke admin role
            await expect(env.fuelMessagePortal.renounceRole(defaultAdminRole, signer0)).to.not.be.reverted;
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)).to.equal(false);
        });

        it('Should not be able to grant admin role as non-admin', async () => {
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)).to.equal(false);

            // Attempt grant admin role
            await expect(env.fuelMessagePortal.grantRole(defaultAdminRole, signer0)).to.be.revertedWith(
                `AccessControl: account ${env.addresses[0].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)).to.equal(false);
        });

        it('Should be able to grant then revoke admin role', async () => {
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)).to.equal(false);
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)).to.equal(true);

            // Grant admin role
            await expect(env.fuelMessagePortal.connect(env.signers[1]).grantRole(defaultAdminRole, signer0)).to.not.be
                .reverted;
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer0)).to.equal(true);

            // Revoke previous admin
            await expect(env.fuelMessagePortal.revokeRole(defaultAdminRole, signer1)).to.not.be.reverted;
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer1)).to.equal(false);
        });

        it('Should be able to grant pauser role', async () => {
            expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(false);

            // Grant pauser role
            await expect(env.fuelMessagePortal.grantRole(pauserRole, signer1)).to.not.be.reverted;
            expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(true);
        });

        it('Should not be able to grant permission as pauser', async () => {
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer2)).to.equal(false);
            expect(await env.fuelMessagePortal.hasRole(pauserRole, signer2)).to.equal(false);

            // Attempt grant admin role
            await expect(
                env.fuelMessagePortal.connect(env.signers[1]).grantRole(defaultAdminRole, signer2)
            ).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelMessagePortal.hasRole(defaultAdminRole, signer2)).to.equal(false);

            // Attempt grant pauser role
            await expect(
                env.fuelMessagePortal.connect(env.signers[1]).grantRole(pauserRole, signer2)
            ).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelMessagePortal.hasRole(pauserRole, signer2)).to.equal(false);
        });

        it('Should be able to revoke pauser role', async () => {
            expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(true);

            // Grant pauser role
            await expect(env.fuelMessagePortal.revokeRole(pauserRole, signer1)).to.not.be.reverted;
            expect(await env.fuelMessagePortal.hasRole(pauserRole, signer1)).to.equal(false);
        });
    });

    describe('Send messages', async () => {
        let provider: Provider;
        let filterAddress: string;
        let fuelBaseAssetDecimals: number;
        let baseAssetConversion: number;
        before(async () => {
            provider = env.fuelMessagePortal.provider;
            filterAddress = env.fuelMessagePortal.address;
            fuelBaseAssetDecimals = await env.fuelMessagePortal.fuelBaseAssetDecimals();
            baseAssetConversion = 10 ** (18 - fuelBaseAssetDecimals);
        });

        it('Should be able to send message with data', async () => {
            const recipient = randomBytes32();
            const data = randomBytes(16);
            await expect(messageTester.attemptSendMessage(recipient, data)).to.not.be.reverted;

            // Check logs for message sent
            const logs = await provider.getLogs({ address: filterAddress });
            const messageSentEvent = env.fuelMessagePortal.interface.parseLog(logs[logs.length - 1]);
            expect(messageSentEvent.name).to.equal('MessageSent');
            expect(messageSentEvent.args.sender).to.equal(
                messageTester.address.split('0x').join('0x000000000000000000000000').toLowerCase()
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
            await expect(messageTester.attemptSendMessage(recipient, [])).to.not.be.reverted;

            // Check logs for message sent
            const logs = await provider.getLogs({ address: filterAddress });
            const messageSentEvent = env.fuelMessagePortal.interface.parseLog(logs[logs.length - 1]);
            expect(messageSentEvent.name).to.equal('MessageSent');
            expect(messageSentEvent.args.sender).to.equal(
                messageTester.address.split('0x').join('0x000000000000000000000000').toLowerCase()
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
            const portalBalance = await provider.getBalance(env.fuelMessagePortal.address);
            await expect(messageTester.attemptSendMessageWithAmount(recipient, ethers.utils.parseEther('0.1'), data)).to
                .not.be.reverted;

            // Check logs for message sent
            const logs = await provider.getLogs({ address: filterAddress });
            const messageSentEvent = env.fuelMessagePortal.interface.parseLog(logs[logs.length - 1]);
            expect(messageSentEvent.name).to.equal('MessageSent');
            expect(messageSentEvent.args.sender).to.equal(
                messageTester.address.split('0x').join('0x000000000000000000000000').toLowerCase()
            );
            expect(messageSentEvent.args.recipient).to.equal(recipient);
            expect(messageSentEvent.args.data).to.equal(data);
            expect(messageSentEvent.args.amount).to.equal(ethers.utils.parseEther('0.1').div(baseAssetConversion));

            // Check that nonce is unique
            expect(nonceList).to.not.include(messageSentEvent.args.nonce);
            nonceList.push(messageSentEvent.args.nonce);

            // Check that portal balance increased
            expect(await provider.getBalance(env.fuelMessagePortal.address)).to.equal(
                portalBalance.add(ethers.utils.parseEther('0.1'))
            );
        });

        it('Should be able to send message with amount and without data', async () => {
            const recipient = randomBytes32();
            const portalBalance = await provider.getBalance(env.fuelMessagePortal.address);
            await expect(messageTester.attemptSendMessageWithAmount(recipient, ethers.utils.parseEther('0.5'), [])).to
                .not.be.reverted;

            // Check logs for message sent
            const logs = await provider.getLogs({ address: filterAddress });
            const messageSentEvent = env.fuelMessagePortal.interface.parseLog(logs[logs.length - 1]);
            expect(messageSentEvent.name).to.equal('MessageSent');
            expect(messageSentEvent.args.sender).to.equal(
                messageTester.address.split('0x').join('0x000000000000000000000000').toLowerCase()
            );
            expect(messageSentEvent.args.recipient).to.equal(recipient);
            expect(messageSentEvent.args.data).to.equal('0x');
            expect(messageSentEvent.args.amount).to.equal(ethers.utils.parseEther('0.5').div(baseAssetConversion));

            // Check that nonce is unique
            expect(nonceList).to.not.include(messageSentEvent.args.nonce);
            nonceList.push(messageSentEvent.args.nonce);

            // Check that portal balance increased
            expect(await provider.getBalance(env.fuelMessagePortal.address)).to.equal(
                portalBalance.add(ethers.utils.parseEther('0.5'))
            );
        });

        it('Should not be able to send message with amount too small', async () => {
            const recipient = randomBytes32();
            await expect(
                env.fuelMessagePortal.sendMessage(recipient, [], {
                    value: 1,
                })
            ).to.be.revertedWith('amount-precision-incompatability');
        });

        it('Should not be able to send message with amount too big', async () => {
            const recipient = randomBytes32();
            await ethers.provider.send('hardhat_setBalance', [env.addresses[0], '0xf00000000000000000000000']);
            await expect(
                env.fuelMessagePortal.sendMessage(recipient, [], {
                    value: BN.from('0x3b9aca000000000000000000'),
                })
            ).to.be.revertedWith('amount-precision-incompatability');
        });

        it('Should not be able to send message with too much data', async () => {
            const recipient = randomBytes32();
            const data = new Uint8Array(65536 + 1);
            await expect(env.fuelMessagePortal.sendMessage(recipient, data)).to.be.revertedWith(
                'message-data-too-large'
            );
        });

        it('Should be able to send message with only ETH', async () => {
            const recipient = randomBytes32();
            await expect(
                env.fuelMessagePortal.depositETH(recipient, {
                    value: ethers.utils.parseEther('1.234'),
                })
            ).to.not.be.reverted;

            // Check logs for message sent
            const logs = await provider.getLogs({ address: filterAddress });
            const messageSentEvent = env.fuelMessagePortal.interface.parseLog(logs[logs.length - 1]);
            expect(messageSentEvent.name).to.equal('MessageSent');
            expect(messageSentEvent.args.sender).to.equal(
                env.addresses[0].split('0x').join('0x000000000000000000000000').toLowerCase()
            );
            expect(messageSentEvent.args.recipient).to.equal(recipient);
            expect(messageSentEvent.args.data).to.equal('0x');
            expect(messageSentEvent.args.amount).to.equal(ethers.utils.parseEther('1.234').div(baseAssetConversion));

            // Check that nonce is unique
            expect(nonceList).to.not.include(messageSentEvent.args.nonce);
            nonceList.push(messageSentEvent.args.nonce);
        });
    });

    describe('Verify pause and unpause', async () => {
        const defaultAdminRole = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const pauserRole = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('PAUSER_ROLE'));
        const recipient = randomBytes32();
        const data = randomBytes(8);

        it('Should be able to grant pauser role', async () => {
            expect(await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])).to.equal(false);

            // Grant pauser role
            await expect(env.fuelMessagePortal.grantRole(pauserRole, env.addresses[2])).to.not.be.reverted;
            expect(await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])).to.equal(true);
        });

        it('Should not be able to pause as non-pauser', async () => {
            expect(await env.fuelMessagePortal.paused()).to.be.equal(false);

            // Attempt pause
            await expect(env.fuelMessagePortal.connect(env.signers[1]).pause()).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${pauserRole}`
            );
            expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
        });

        it('Should be able to pause as pauser', async () => {
            expect(await env.fuelMessagePortal.paused()).to.be.equal(false);

            // Pause
            await expect(env.fuelMessagePortal.connect(env.signers[2]).pause()).to.not.be.reverted;
            expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
        });

        it('Should not be able to unpause as pauser (and not admin)', async () => {
            expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

            // Attempt unpause
            await expect(env.fuelMessagePortal.connect(env.signers[2]).unpause()).to.be.revertedWith(
                `AccessControl: account ${env.addresses[2].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
        });

        it('Should not be able to unpause as non-admin', async () => {
            expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

            // Attempt unpause
            await expect(env.fuelMessagePortal.connect(env.signers[1]).unpause()).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
        });

        it('Should not be able to send messages when paused', async () => {
            expect(await env.fuelMessagePortal.paused()).to.be.equal(true);
            await expect(env.fuelMessagePortal.sendMessage(recipient, data)).to.be.revertedWith('Pausable: paused');
            await expect(env.fuelMessagePortal.depositETH(recipient, { value: 1 })).to.be.revertedWith(
                'Pausable: paused'
            );
        });

        it('Should be able to unpause as admin', async () => {
            expect(await env.fuelMessagePortal.paused()).to.be.equal(true);

            // Unpause
            await expect(env.fuelMessagePortal.unpause()).to.not.be.reverted;
            expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
        });

        it('Should be able to send messages when unpaused', async () => {
            expect(await env.fuelMessagePortal.paused()).to.be.equal(false);
            await expect(env.fuelMessagePortal.sendMessage(recipient, data)).to.not.be.reverted;
        });

        it('Should be able to revoke pauser role', async () => {
            expect(await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])).to.equal(true);

            // Grant pauser role
            await expect(env.fuelMessagePortal.revokeRole(pauserRole, env.addresses[2])).to.not.be.reverted;
            expect(await env.fuelMessagePortal.hasRole(pauserRole, env.addresses[2])).to.equal(false);
        });
    });
});
