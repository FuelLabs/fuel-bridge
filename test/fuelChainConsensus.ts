import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { HarnessObject, setupFuel } from '../protocol/harness';
import BlockHeader, { computeBlockId } from '../protocol/blockHeader';
import { EMPTY } from '../protocol/constants';
import { compactSign } from '../protocol/validators';
import { SigningKey } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

chai.use(solidity);
const { expect } = chai;

// Create a simple block
function createBlock(blockIds: string[], messageIds: string[]): BlockHeader {
    const tai64Time = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add('4611686018427387914');
    const header: BlockHeader = {
        prevRoot: EMPTY,
        height: blockIds.length.toString(),
        timestamp: tai64Time.toHexString(),
        daHeight: '0',
        txCount: '0',
        outputMessagesCount: messageIds.length.toString(),
        txRoot: EMPTY,
        outputMessagesRoot: EMPTY,
    };

    return header;
}

describe('Fuel Chain Consensus', async () => {
    let env: HarnessObject;

    // Arrays of committed block headers and their IDs
    let blockHeader: BlockHeader;
    let blockId: string;
    let blockSignature: string;

    before(async () => {
        env = await setupFuel();

        // create a block
        blockHeader = createBlock([], []);
        blockId = computeBlockId(blockHeader);
        blockSignature = await compactSign(env.poaSigner, blockId);
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
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer1)).to.equal(false);

            // Grant admin role
            await expect(env.fuelChainConsensus.grantRole(defaultAdminRole, signer1)).to.not.be.reverted;
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer1)).to.equal(true);
        });

        it('Should be able to renounce admin role', async () => {
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer0)).to.equal(true);

            // Revoke admin role
            await expect(env.fuelChainConsensus.renounceRole(defaultAdminRole, signer0)).to.not.be.reverted;
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer0)).to.equal(false);
        });

        it('Should not be able to grant admin role as non-admin', async () => {
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer0)).to.equal(false);

            // Attempt grant admin role
            await expect(env.fuelChainConsensus.grantRole(defaultAdminRole, signer0)).to.be.revertedWith(
                `AccessControl: account ${env.addresses[0].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer0)).to.equal(false);
        });

        it('Should be able to grant then revoke admin role', async () => {
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer0)).to.equal(false);
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer1)).to.equal(true);

            // Grant admin role
            await expect(env.fuelChainConsensus.connect(env.signers[1]).grantRole(defaultAdminRole, signer0)).to.not.be
                .reverted;
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer0)).to.equal(true);

            // Revoke previous admin
            await expect(env.fuelChainConsensus.revokeRole(defaultAdminRole, signer1)).to.not.be.reverted;
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer1)).to.equal(false);
        });

        it('Should be able to grant pauser role', async () => {
            expect(await env.fuelChainConsensus.hasRole(pauserRole, signer1)).to.equal(false);

            // Grant pauser role
            await expect(env.fuelChainConsensus.grantRole(pauserRole, signer1)).to.not.be.reverted;
            expect(await env.fuelChainConsensus.hasRole(pauserRole, signer1)).to.equal(true);
        });

        it('Should not be able to grant permission as pauser', async () => {
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer2)).to.equal(false);
            expect(await env.fuelChainConsensus.hasRole(pauserRole, signer2)).to.equal(false);

            // Attempt grant admin role
            await expect(
                env.fuelChainConsensus.connect(env.signers[1]).grantRole(defaultAdminRole, signer2)
            ).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelChainConsensus.hasRole(defaultAdminRole, signer2)).to.equal(false);

            // Attempt grant pauser role
            await expect(
                env.fuelChainConsensus.connect(env.signers[1]).grantRole(pauserRole, signer2)
            ).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelChainConsensus.hasRole(pauserRole, signer2)).to.equal(false);
        });

        it('Should be able to revoke pauser role', async () => {
            expect(await env.fuelChainConsensus.hasRole(pauserRole, signer1)).to.equal(true);

            // Grant pauser role
            await expect(env.fuelChainConsensus.revokeRole(pauserRole, signer1)).to.not.be.reverted;
            expect(await env.fuelChainConsensus.hasRole(pauserRole, signer1)).to.equal(false);
        });
    });

    describe('Verify admin functions', async () => {
        const defaultAdminRole = '0x0000000000000000000000000000000000000000000000000000000000000000';
        let signer1: string;
        before(async () => {
            signer1 = env.addresses[1];
        });

        it('Should be able to set authority as owner', async () => {
            expect(await env.fuelChainConsensus.authorityKey()).to.not.be.equal(signer1);

            // Set authority
            await expect(env.fuelChainConsensus.setAuthorityKey(signer1)).to.not.be.reverted;
            expect(await env.fuelChainConsensus.authorityKey()).to.be.equal(signer1);
        });

        it('Should not be able to set authority as non-owner', async () => {
            expect(await env.fuelChainConsensus.authorityKey()).to.be.equal(signer1);

            // Attempt set authority
            await expect(
                env.fuelChainConsensus.connect(env.signers[1]).setAuthorityKey(env.poaSignerAddress)
            ).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelChainConsensus.authorityKey()).to.be.equal(signer1);
        });

        it('Should be able to switch authority back', async () => {
            expect(await env.fuelChainConsensus.authorityKey()).to.not.be.equal(env.poaSignerAddress);

            // Set authority
            await expect(env.fuelChainConsensus.setAuthorityKey(env.poaSignerAddress)).to.not.be.reverted;
            expect(await env.fuelChainConsensus.authorityKey()).to.be.equal(env.poaSignerAddress);
        });
    });

    describe('Verify valid blocks', async () => {
        let badSignature: string;
        before(async () => {
            const badSigner = new SigningKey('0x44bacb478cbed5efcae784d7bf4f2ff80ac0974bec39a17e36ba4a6b4d238ff9');
            badSignature = await compactSign(badSigner, blockId);
        });

        it('Should be able to verify valid block', async () => {
            expect(await env.fuelChainConsensus.verifyBlock(blockId, blockSignature)).to.be.equal(true);
        });

        it('Should not be able to verify invalid block', async () => {
            expect(await env.fuelChainConsensus.verifyBlock(blockId, badSignature)).to.be.equal(false);
        });
    });

    describe('Verify pause and unpause', async () => {
        const defaultAdminRole = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const pauserRole = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('PAUSER_ROLE'));

        it('Should be able to grant pauser role', async () => {
            expect(await env.fuelChainConsensus.hasRole(pauserRole, env.addresses[2])).to.equal(false);

            // Grant pauser role
            await expect(env.fuelChainConsensus.grantRole(pauserRole, env.addresses[2])).to.not.be.reverted;
            expect(await env.fuelChainConsensus.hasRole(pauserRole, env.addresses[2])).to.equal(true);
        });

        it('Should not be able to pause as non-pauser', async () => {
            expect(await env.fuelChainConsensus.paused()).to.be.equal(false);

            // Attempt pause
            await expect(env.fuelChainConsensus.connect(env.signers[1]).pause()).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${pauserRole}`
            );
            expect(await env.fuelChainConsensus.paused()).to.be.equal(false);
        });

        it('Should be able to pause as pauser', async () => {
            expect(await env.fuelChainConsensus.paused()).to.be.equal(false);

            // Pause
            await expect(env.fuelChainConsensus.connect(env.signers[2]).pause()).to.not.be.reverted;
            expect(await env.fuelChainConsensus.paused()).to.be.equal(true);
        });

        it('Should not be able to unpause as pauser (and not admin)', async () => {
            expect(await env.fuelChainConsensus.paused()).to.be.equal(true);

            // Attempt unpause
            await expect(env.fuelChainConsensus.connect(env.signers[2]).unpause()).to.be.revertedWith(
                `AccessControl: account ${env.addresses[2].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelChainConsensus.paused()).to.be.equal(true);
        });

        it('Should not be able to unpause as non-admin', async () => {
            expect(await env.fuelChainConsensus.paused()).to.be.equal(true);

            // Attempt unpause
            await expect(env.fuelChainConsensus.connect(env.signers[1]).unpause()).to.be.revertedWith(
                `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
            );
            expect(await env.fuelChainConsensus.paused()).to.be.equal(true);
        });

        it('Should not be able to verify blocks when paused', async () => {
            await expect(env.fuelChainConsensus.verifyBlock(blockId, blockSignature)).to.be.revertedWith(
                'Pausable: paused'
            );
        });

        it('Should be able to unpause as admin', async () => {
            expect(await env.fuelChainConsensus.paused()).to.be.equal(true);

            // Unpause
            await expect(env.fuelChainConsensus.unpause()).to.not.be.reverted;
            expect(await env.fuelChainConsensus.paused()).to.be.equal(false);
        });

        it('Should be able to verify block when unpaused', async () => {
            expect(await env.fuelChainConsensus.verifyBlock(blockId, blockSignature)).to.be.equal(true);
        });

        it('Should be able to revoke pauser role', async () => {
            expect(await env.fuelChainConsensus.hasRole(pauserRole, env.addresses[2])).to.equal(true);

            // Grant pauser role
            await expect(env.fuelChainConsensus.revokeRole(pauserRole, env.addresses[2])).to.not.be.reverted;
            expect(await env.fuelChainConsensus.hasRole(pauserRole, env.addresses[2])).to.equal(false);
        });
    });
});
