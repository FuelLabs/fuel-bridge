import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { randomInt } from 'crypto';
import { randomBytes } from 'ethers';

import type { FuelMessagePortalV4 } from '../../typechain';

export type FuelMessagePortalV4Fixture = {
  signers: HardhatEthersSigner[];
  fuelMessagePortal: FuelMessagePortalV4;
  [key: string]: any;
};

export function behavesLikeFuelMessagePortalV4(
  fixture: () => Promise<FuelMessagePortalV4Fixture>
) {
  describe('Includes access control features', () => {
    describe('sendTransaction()', () => {
      it('emits a Transaction event', async () => {
        const { fuelMessagePortal } = await fixture();

        const payloadLength = Math.abs(randomInt(256));
        const gas = Math.abs(randomInt(256));
        const serializedTx = randomBytes(payloadLength);

        const tx = fuelMessagePortal.sendTransaction(gas, serializedTx);

        await expect(tx)
          .to.emit(fuelMessagePortal, 'Transaction')
          .withArgs(0, gas, serializedTx);
      });

      it('increments nonces', async () => {
        const { fuelMessagePortal } = await fixture();

        const payloadLength = Math.abs(randomInt(256));
        const gas = Math.abs(randomInt(256));
        const serializedTx = randomBytes(payloadLength);

        await fuelMessagePortal.sendTransaction(gas, serializedTx);
        const tx = fuelMessagePortal.sendTransaction(gas, serializedTx);

        await expect(tx)
          .to.emit(fuelMessagePortal, 'Transaction')
          .withArgs(1, gas, serializedTx);
      });
    });
  });
}
