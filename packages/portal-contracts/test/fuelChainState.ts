import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { HarnessObject, setupFuel } from '../protocol/harness';
import BlockHeader, { computeBlockId } from '../protocol/blockHeader';
import { EMPTY } from '../protocol/constants';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { randomBytes32, tai64Time } from '../protocol/utils';

chai.use(solidity);
const { expect } = chai;

// Create a simple block
function createBlock(height: number): BlockHeader {
  const header: BlockHeader = {
    prevRoot: EMPTY,
    height: BigNumber.from(height).toHexString(),
    timestamp: tai64Time(new Date().getTime()),
    daHeight: '0',
    txCount: '0',
    outputMessagesCount: '0',
    txRoot: EMPTY,
    outputMessagesRoot: EMPTY,
  };

  return header;
}

describe('Fuel Chain State', async () => {
  let env: HarnessObject;

  // Contract constants
  const TIME_TO_FINALIZE = 10800;
  const BLOCKS_PER_COMMIT_INTERVAL = 10800;

  // Committed block headers
  let blockHeader: BlockHeader;
  let blockId: string;
  let blockHeaderUnfinalized: BlockHeader;
  let blockIdUnfinalized: string;

  before(async () => {
    env = await setupFuel();

    // Create, commit, finalize a block
    blockHeader = createBlock(0);
    blockId = computeBlockId(blockHeader);
    await env.fuelChainState.commit(blockId, 0);
    ethers.provider.send('evm_increaseTime', [TIME_TO_FINALIZE]);

    // Create an unfinalized block
    blockHeaderUnfinalized = createBlock(BLOCKS_PER_COMMIT_INTERVAL);
    blockIdUnfinalized = computeBlockId(blockHeaderUnfinalized);
    await env.fuelChainState.commit(blockIdUnfinalized, 1);
  });

  describe('Verify access control', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const pauserRole = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes('PAUSER_ROLE')
    );
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
        await env.fuelChainState.hasRole(defaultAdminRole, signer1)
      ).to.equal(false);

      // Grant admin role
      await expect(env.fuelChainState.grantRole(defaultAdminRole, signer1)).to
        .not.be.reverted;
      expect(
        await env.fuelChainState.hasRole(defaultAdminRole, signer1)
      ).to.equal(true);
    });

    it('Should be able to renounce admin role', async () => {
      expect(
        await env.fuelChainState.hasRole(defaultAdminRole, signer0)
      ).to.equal(true);

      // Revoke admin role
      await expect(env.fuelChainState.renounceRole(defaultAdminRole, signer0))
        .to.not.be.reverted;
      expect(
        await env.fuelChainState.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
    });

    it('Should not be able to grant admin role as non-admin', async () => {
      expect(
        await env.fuelChainState.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);

      // Attempt grant admin role
      await expect(
        env.fuelChainState.grantRole(defaultAdminRole, signer0)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[0].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(
        await env.fuelChainState.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
    });

    it('Should be able to grant then revoke admin role', async () => {
      expect(
        await env.fuelChainState.hasRole(defaultAdminRole, signer0)
      ).to.equal(false);
      expect(
        await env.fuelChainState.hasRole(defaultAdminRole, signer1)
      ).to.equal(true);

      // Grant admin role
      await expect(
        env.fuelChainState
          .connect(env.signers[1])
          .grantRole(defaultAdminRole, signer0)
      ).to.not.be.reverted;
      expect(
        await env.fuelChainState.hasRole(defaultAdminRole, signer0)
      ).to.equal(true);

      // Revoke previous admin
      await expect(env.fuelChainState.revokeRole(defaultAdminRole, signer1)).to
        .not.be.reverted;
      expect(
        await env.fuelChainState.hasRole(defaultAdminRole, signer1)
      ).to.equal(false);
    });

    it('Should be able to grant pauser role', async () => {
      expect(await env.fuelChainState.hasRole(pauserRole, signer1)).to.equal(
        false
      );

      // Grant pauser role
      await expect(env.fuelChainState.grantRole(pauserRole, signer1)).to.not.be
        .reverted;
      expect(await env.fuelChainState.hasRole(pauserRole, signer1)).to.equal(
        true
      );
    });

    it('Should not be able to grant permission as pauser', async () => {
      expect(
        await env.fuelChainState.hasRole(defaultAdminRole, signer2)
      ).to.equal(false);
      expect(await env.fuelChainState.hasRole(pauserRole, signer2)).to.equal(
        false
      );

      // Attempt grant admin role
      await expect(
        env.fuelChainState
          .connect(env.signers[1])
          .grantRole(defaultAdminRole, signer2)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(
        await env.fuelChainState.hasRole(defaultAdminRole, signer2)
      ).to.equal(false);

      // Attempt grant pauser role
      await expect(
        env.fuelChainState
          .connect(env.signers[1])
          .grantRole(pauserRole, signer2)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelChainState.hasRole(pauserRole, signer2)).to.equal(
        false
      );
    });

    it('Should be able to revoke pauser role', async () => {
      expect(await env.fuelChainState.hasRole(pauserRole, signer1)).to.equal(
        true
      );

      // Grant pauser role
      await expect(env.fuelChainState.revokeRole(pauserRole, signer1)).to.not.be
        .reverted;
      expect(await env.fuelChainState.hasRole(pauserRole, signer1)).to.equal(
        false
      );
    });
  });

  describe('Verify admin functions', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const committerRole = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes('COMMITTER_ROLE')
    );
    let signer1: string;
    let signer2: string;
    before(async () => {
      signer1 = env.addresses[1];
      signer2 = env.addresses[2];
    });

    it('Should be able to set comitter as admin', async () => {
      expect(await env.fuelChainState.hasRole(committerRole, signer1)).to.equal(
        false
      );

      // Set comitter
      await expect(env.fuelChainState.grantRole(committerRole, signer1)).to.not
        .be.reverted;
      expect(await env.fuelChainState.hasRole(committerRole, signer1)).to.equal(
        true
      );
    });

    it('Should not be able to set committer role as non-admin', async () => {
      expect(await env.fuelChainState.hasRole(committerRole, signer2)).to.equal(
        false
      );

      // Attempt set comitter
      await expect(
        env.fuelChainState
          .connect(env.signers[1])
          .grantRole(committerRole, signer2)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelChainState.hasRole(committerRole, signer2)).to.equal(
        false
      );
    });

    it('Should not be able to make commits as non-comitter', async () => {
      const blockHash = await env.fuelChainState.blockHashAtCommit(9);
      await expect(
        env.fuelChainState.connect(env.signers[2]).commit(randomBytes32(), 9)
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[2].toLowerCase()} is missing role ${committerRole}`
      );
      expect(await env.fuelChainState.blockHashAtCommit(9)).to.equal(blockHash);
    });

    it('Should be able to make commits as comitter', async () => {
      const blockHash = randomBytes32();
      await expect(
        env.fuelChainState.connect(env.signers[1]).commit(blockHash, 9)
      ).to.not.be.reverted;
      expect(await env.fuelChainState.blockHashAtCommit(9)).to.equal(blockHash);
    });
  });

  describe('Verify valid blocks', async () => {
    it('Should be able to verify valid block', async () => {
      expect(await env.fuelChainState.finalized(blockId, 0)).to.be.equal(true);
    });

    it('Should not be able to verify unfinalized block', async () => {
      expect(
        await env.fuelChainState.finalized(
          blockIdUnfinalized,
          BLOCKS_PER_COMMIT_INTERVAL
        )
      ).to.be.equal(false);
    });

    it('Should not be able to verify invalid block', async () => {
      await expect(
        env.fuelChainState.finalized(randomBytes32(), 0)
      ).to.be.revertedWith('Unknown block');
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
        await env.fuelChainState.hasRole(pauserRole, env.addresses[2])
      ).to.equal(false);

      // Grant pauser role
      await expect(env.fuelChainState.grantRole(pauserRole, env.addresses[2]))
        .to.not.be.reverted;
      expect(
        await env.fuelChainState.hasRole(pauserRole, env.addresses[2])
      ).to.equal(true);
    });

    it('Should not be able to pause as non-pauser', async () => {
      expect(await env.fuelChainState.paused()).to.be.equal(false);

      // Attempt pause
      await expect(
        env.fuelChainState.connect(env.signers[1]).pause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${pauserRole}`
      );
      expect(await env.fuelChainState.paused()).to.be.equal(false);
    });

    it('Should be able to pause as pauser', async () => {
      expect(await env.fuelChainState.paused()).to.be.equal(false);

      // Pause
      await expect(env.fuelChainState.connect(env.signers[2]).pause()).to.not.be
        .reverted;
      expect(await env.fuelChainState.paused()).to.be.equal(true);
    });

    it('Should not be able to unpause as pauser (and not admin)', async () => {
      expect(await env.fuelChainState.paused()).to.be.equal(true);

      // Attempt unpause
      await expect(
        env.fuelChainState.connect(env.signers[2]).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[2].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelChainState.paused()).to.be.equal(true);
    });

    it('Should not be able to unpause as non-admin', async () => {
      expect(await env.fuelChainState.paused()).to.be.equal(true);

      // Attempt unpause
      await expect(
        env.fuelChainState.connect(env.signers[1]).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${env.addresses[1].toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await env.fuelChainState.paused()).to.be.equal(true);
    });

    it('Should not be able to verify blocks when paused', async () => {
      await expect(env.fuelChainState.finalized(blockId, 0)).to.be.revertedWith(
        'Pausable: paused'
      );
    });

    it('Should not be able to commit blocks when paused', async () => {
      await expect(
        env.fuelChainState.commit(randomBytes32(), 9)
      ).to.be.revertedWith('Pausable: paused');
    });

    it('Should be able to unpause as admin', async () => {
      expect(await env.fuelChainState.paused()).to.be.equal(true);

      // Unpause
      await expect(env.fuelChainState.unpause()).to.not.be.reverted;
      expect(await env.fuelChainState.paused()).to.be.equal(false);
    });

    it('Should be able to verify block when unpaused', async () => {
      expect(await env.fuelChainState.finalized(blockId, 0)).to.be.equal(true);
    });

    it('Should be able to revoke pauser role', async () => {
      expect(
        await env.fuelChainState.hasRole(pauserRole, env.addresses[2])
      ).to.equal(true);

      // Grant pauser role
      await expect(env.fuelChainState.revokeRole(pauserRole, env.addresses[2]))
        .to.not.be.reverted;
      expect(
        await env.fuelChainState.hasRole(pauserRole, env.addresses[2])
      ).to.equal(false);
    });
  });
});
