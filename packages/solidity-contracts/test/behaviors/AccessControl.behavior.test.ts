import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { keccak256, toUtf8Bytes } from 'ethers';

import type { AccessControlUpgradeable } from '../../typechain';

export type AccessControlFixture = {
  signers: HardhatEthersSigner[];
  [key: string]: any;
};

export function behavesLikeAccessControl(
  fixture: () => Promise<AccessControlFixture>,
  name: string = 'fuelMessagePortal'
) {
  let fixt: AccessControlFixture;
  describe('Includes access control features', () => {
    const defaultAdminRole =
      '0x0000000000000000000000000000000000000000000000000000000000000000';
    const pauserRole = keccak256(toUtf8Bytes('PAUSER_ROLE'));
    let signer0: string;
    let signer1: string;
    let signer2: string;
    let contract: AccessControlUpgradeable;

    before('instantiate fixture', async () => {
      fixt = await fixture();
      [signer0, signer1, signer2] = fixt.signers.map(
        (signer) => signer.address
      );
      contract = fixt[name];
    });

    it('Should be able to grant admin role', async () => {
      expect(await contract.hasRole(defaultAdminRole, signer1)).to.equal(false);

      // Grant admin role
      await expect(contract.grantRole(defaultAdminRole, signer1)).to.not.be
        .reverted;
      expect(await contract.hasRole(defaultAdminRole, signer1)).to.equal(true);
    });

    it('Should be able to renounce admin role', async () => {
      expect(await contract.hasRole(defaultAdminRole, signer0)).to.equal(true);

      // Revoke admin role
      await expect(contract.renounceRole(defaultAdminRole, signer0)).to.not.be
        .reverted;
      expect(await contract.hasRole(defaultAdminRole, signer0)).to.equal(false);
    });

    it('Should not be able to grant admin role as non-admin', async () => {
      expect(await contract.hasRole(defaultAdminRole, signer0)).to.equal(false);

      // Attempt grant admin role
      await expect(
        contract.grantRole(defaultAdminRole, signer0)
      ).to.be.revertedWith(
        `AccessControl: account ${signer0.toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await contract.hasRole(defaultAdminRole, signer0)).to.equal(false);
    });

    it('Should be able to grant then revoke admin role', async () => {
      expect(await contract.hasRole(defaultAdminRole, signer0)).to.equal(false);
      expect(await contract.hasRole(defaultAdminRole, signer1)).to.equal(true);

      // Grant admin role
      await expect(
        contract.connect(fixt.signers[1]).grantRole(defaultAdminRole, signer0)
      ).to.not.be.reverted;
      expect(await contract.hasRole(defaultAdminRole, signer0)).to.equal(true);

      // Revoke previous admin
      await expect(contract.revokeRole(defaultAdminRole, signer1)).to.not.be
        .reverted;
      expect(await contract.hasRole(defaultAdminRole, signer1)).to.equal(false);
    });

    it('Should be able to grant pauser role', async () => {
      expect(await contract.hasRole(pauserRole, signer1)).to.equal(false);

      // Grant pauser role
      await expect(contract.grantRole(pauserRole, signer1)).to.not.be.reverted;
      expect(await contract.hasRole(pauserRole, signer1)).to.equal(true);
    });

    it('Should not be able to grant permission as pauser', async () => {
      expect(await contract.hasRole(defaultAdminRole, signer2)).to.equal(false);
      expect(await contract.hasRole(pauserRole, signer2)).to.equal(false);

      // Attempt grant admin role
      await expect(
        contract.connect(fixt.signers[1]).grantRole(defaultAdminRole, signer2)
      ).to.be.revertedWith(
        `AccessControl: account ${signer1.toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await contract.hasRole(defaultAdminRole, signer2)).to.equal(false);

      // Attempt grant pauser role
      await expect(
        contract.connect(fixt.signers[1]).grantRole(pauserRole, signer2)
      ).to.be.revertedWith(
        `AccessControl: account ${signer1.toLowerCase()} is missing role ${defaultAdminRole}`
      );
      expect(await contract.hasRole(pauserRole, signer2)).to.equal(false);
    });

    it('Should be able to revoke pauser role', async () => {
      expect(await contract.hasRole(pauserRole, signer1)).to.equal(true);

      // Grant pauser role
      await expect(contract.revokeRole(pauserRole, signer1)).to.not.be.reverted;
      expect(await contract.hasRole(pauserRole, signer1)).to.equal(false);
    });
  });
}
