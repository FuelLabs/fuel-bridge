import { time } from '@nomicfoundation/hardhat-network-helpers';
import chai from 'chai';
import { keccak256, toBeHex, toUtf8Bytes } from 'ethers';
import { ethers, upgrades } from 'hardhat';

import type BlockHeader from '../protocol/blockHeader';
import { computeBlockId } from '../protocol/blockHeader';
import {
  CONSENSUS_PARAMETERS_VERSION,
  EMPTY,
  STATE_TRANSITION_BYTECODE_VERSION,
} from '../protocol/constants';
import { setupFuel } from '../protocol/harness';
import type { HarnessObject } from '../protocol/harness';
import { randomBytes32, tai64Time } from '../protocol/utils';

const { expect } = chai;

// Create a simple block
function createBlock(height: number): BlockHeader {
  const header: BlockHeader = {
    prevRoot: EMPTY,
    height: toBeHex(BigInt(height)),
    timestamp: tai64Time(new Date().getTime()),
    daHeight: '0',
    txCount: '0',
    outputMessagesCount: '0',
    txRoot: EMPTY,
    outputMessagesRoot: EMPTY,
    consensusParametersVersion: CONSENSUS_PARAMETERS_VERSION,
    stateTransitionBytecodeVersion: STATE_TRANSITION_BYTECODE_VERSION,
    eventInboxRoot: EMPTY,
  };

  return header;
}

describe('Fuel Chain State', async () => {
  let env: HarnessObject;

  // Contract constants
  const TIME_TO_FINALIZE = 10800;
  const BLOCKS_PER_COMMIT_INTERVAL = 10800;
  const COMMIT_COOLDOWN = 10800;

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

  describe('Checks deployment params', async () => {
    const FuelChainState = await ethers.getContractFactory('FuelChainState');
    it('reverts if time to finalise is 0', async () => {
      await expect(
        upgrades.deployProxy(FuelChainState, [], {
          initializer: 'initialize',
          constructorArgs: [0, BLOCKS_PER_COMMIT_INTERVAL, COMMIT_COOLDOWN],
        })
      ).to.be.revertedWithCustomError(FuelChainState, 'InvalidTimeToFinalize');
    });

    it('reverts if time to finalise is more than commitCooldown', async () => {
      await expect(
        upgrades.deployProxy(FuelChainState, [], {
          initializer: 'initialize',
          constructorArgs: [
            TIME_TO_FINALIZE + 1,
            BLOCKS_PER_COMMIT_INTERVAL,
            COMMIT_COOLDOWN,
          ],
        })
      ).to.be.revertedWithCustomError(
        FuelChainState,
        'FinalizationIsGtCooldown'
      );
    });

    it('reverts if time to finalise is more than commitCooldown', async () => {
      await expect(
        upgrades.deployProxy(FuelChainState, [], {
          initializer: 'initialize',
          constructorArgs: [
            TIME_TO_FINALIZE * 240 + 1,
            BLOCKS_PER_COMMIT_INTERVAL,
            COMMIT_COOLDOWN,
          ],
        })
      ).to.be.revertedWithCustomError(FuelChainState, 'TimeToFinalizeTooLarge');
    });

    it('reverts if time to finalise is more than circularBufferSizeInSeconds', async () => {
      await expect(
        upgrades.deployProxy(FuelChainState, [], {
          initializer: 'initialize',
          constructorArgs: [
            TIME_TO_FINALIZE,
            BLOCKS_PER_COMMIT_INTERVAL * 240,
            COMMIT_COOLDOWN * 240 + 1,
          ],
        })
      ).to.be.revertedWithCustomError(FuelChainState, 'CommitCooldownTooLarge');
    });

    it('Deployments happens Successfully with correct deploy params', async () => {
      await upgrades
        .deployProxy(FuelChainState, [], {
          initializer: 'initialize',
          constructorArgs: [
            TIME_TO_FINALIZE,
            BLOCKS_PER_COMMIT_INTERVAL,
            COMMIT_COOLDOWN,
          ],
        })
        .then((tx) => tx.waitForDeployment());
    });
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
    const committerRole = keccak256(toUtf8Bytes('COMMITTER_ROLE'));
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
      ).to.be.revertedWithCustomError(env.fuelChainState, 'UnknownBlock');
    });
  });

  describe('Verify recommit cooldown', () => {
    it('Should revert when trying to recommit to a warm slot', async () => {
      const blockHash = randomBytes32();
      const slot = 10;
      await env.fuelChainState.connect(env.signers[1]).commit(blockHash, slot);

      expect(await env.fuelChainState.blockHashAtCommit(slot)).to.equal(
        blockHash
      );

      const cooldown = await env.fuelChainState.COMMIT_COOLDOWN();
      const currentTime = await ethers.provider
        .getBlock('latest')
        .then((block) => block.timestamp);
      await time.setNextBlockTimestamp(cooldown + BigInt(currentTime) - 1n);

      const tx = env.fuelChainState
        .connect(env.signers[1])
        .commit(blockHash, slot);

      await expect(tx).to.be.revertedWithCustomError(
        env.fuelChainState,
        'CannotRecommit'
      );
      await time.setNextBlockTimestamp(cooldown + BigInt(currentTime));

      const newBlockHash = randomBytes32();
      await env.fuelChainState
        .connect(env.signers[1])
        .commit(newBlockHash, slot);
      expect(await env.fuelChainState.blockHashAtCommit(slot)).to.equal(
        newBlockHash
      );
    });
  });

  describe('Verify pause and unpause', async () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const pauserRole = keccak256(toUtf8Bytes('PAUSER_ROLE'));

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
