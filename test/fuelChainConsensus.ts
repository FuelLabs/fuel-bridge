import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { HarnessObject, setupFuel } from '../protocol/harness';
import BlockHeader, { computeBlockId } from '../protocol/blockHeader';
import { EMPTY } from '../protocol/constants';
import { compactSign } from '../protocol/validators';
import { SigningKey } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';

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

    describe('Verify ownership', async () => {
        let signer0: string;
        let signer1: string;
        before(async () => {
            signer0 = env.addresses[0];
            signer1 = env.addresses[1];
        });

        it('Should be able to switch owner as owner', async () => {
            expect(await env.fuelChainConsensus.owner()).to.not.be.equal(signer1);

            // Transfer ownership
            await expect(env.fuelChainConsensus.transferOwnership(signer1)).to.not.be.reverted;
            expect(await env.fuelChainConsensus.owner()).to.be.equal(signer1);
        });

        it('Should not be able to switch owner as non-owner', async () => {
            expect(await env.fuelChainConsensus.owner()).to.be.equal(signer1);

            // Attempt transfer ownership
            await expect(env.fuelChainConsensus.transferOwnership(signer0)).to.be.revertedWith(
                'Ownable: caller is not the owner'
            );
            expect(await env.fuelChainConsensus.owner()).to.be.equal(signer1);
        });

        it('Should be able to switch owner back', async () => {
            expect(await env.fuelChainConsensus.owner()).to.not.be.equal(signer0);

            // Transfer ownership
            await expect(env.fuelChainConsensus.connect(env.signers[1]).transferOwnership(signer0)).to.not.be.reverted;
            expect(await env.fuelChainConsensus.owner()).to.be.equal(signer0);
        });
    });

    describe('Verify admin functions', async () => {
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
            ).to.be.revertedWith('Ownable: caller is not the owner');
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
        it('Should not be able to pause as non-owner', async () => {
            expect(await env.fuelChainConsensus.paused()).to.be.equal(false);

            // Attempt pause
            await expect(env.fuelChainConsensus.connect(env.signers[1]).pause()).to.be.revertedWith(
                'Ownable: caller is not the owner'
            );
            expect(await env.fuelChainConsensus.paused()).to.be.equal(false);
        });

        it('Should be able to pause as owner', async () => {
            expect(await env.fuelChainConsensus.paused()).to.be.equal(false);

            // Pause
            await expect(env.fuelChainConsensus.pause()).to.not.be.reverted;
            expect(await env.fuelChainConsensus.paused()).to.be.equal(true);
        });

        it('Should not be able to unpause as non-owner', async () => {
            expect(await env.fuelChainConsensus.paused()).to.be.equal(true);

            // Attempt unpause
            await expect(env.fuelChainConsensus.connect(env.signers[1]).unpause()).to.be.revertedWith(
                'Ownable: caller is not the owner'
            );
            expect(await env.fuelChainConsensus.paused()).to.be.equal(true);
        });

        it('Should not be able to verify block messages when paused', async () => {
            await expect(env.fuelChainConsensus.verifyBlock(blockId, blockSignature)).to.be.revertedWith(
                'Pausable: paused'
            );
        });

        it('Should be able to unpause as owner', async () => {
            expect(await env.fuelChainConsensus.paused()).to.be.equal(true);

            // Unpause
            await expect(env.fuelChainConsensus.unpause()).to.not.be.reverted;
            expect(await env.fuelChainConsensus.paused()).to.be.equal(false);
        });

        it('Should be able to verify block when unpaused', async () => {
            expect(await env.fuelChainConsensus.verifyBlock(blockId, blockSignature)).to.be.equal(true);
        });
    });
});
