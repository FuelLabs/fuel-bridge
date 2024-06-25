import hre from 'hardhat';
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { mine } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { randomInt } from 'crypto';
import { parseEther, parseUnits, randomBytes } from 'ethers';

import type { FuelMessagePortalV4 } from '../../typechain';
import { haltBlockProduction, resumeInstantBlockProduction } from '../utils';

export type FuelMessagePortalV4Fixture = {
  signers: HardhatEthersSigner[];
  fuelMessagePortal: FuelMessagePortalV4;
  [key: string]: any;
};

const SCALED_UNIT = 10n ** 18n;
const ONE_AND_A_HALF = SCALED_UNIT + SCALED_UNIT / 2n;

export function behavesLikeFuelMessagePortalV4(
  fixture: () => Promise<FuelMessagePortalV4Fixture>
) {
  let GAS_LIMIT: bigint;
  let GAS_TARGET: bigint;
  let MIN_GAS_PER_TX: number;
  let MIN_GAS_PRICE: bigint;
  let FEE_COLLECTOR_ROLE: string;

  describe('Behaves like FuelMessagePortalV4', () => {
    before('cache gas limit', async () => {
      const { fuelMessagePortal } = await fixture();
      GAS_LIMIT = await fuelMessagePortal.GAS_LIMIT();
      GAS_TARGET = await fuelMessagePortal.GAS_TARGET();
      MIN_GAS_PRICE = await fuelMessagePortal.MIN_GAS_PRICE();
      MIN_GAS_PER_TX = Number(
        (await fuelMessagePortal.MIN_GAS_PER_TX()).toString()
      );
      FEE_COLLECTOR_ROLE = await fuelMessagePortal.FEE_COLLECTOR_ROLE();
    });

    describe('sendTransaction()', () => {
      afterEach('restore block production', async () => {
        await resumeInstantBlockProduction(hre);
      });

      it('emits a Transaction event', async () => {
        const { fuelMessagePortal } = await fixture();

        const payloadLength = Math.abs(randomInt(256));
        const gas = Math.abs(randomInt(MIN_GAS_PER_TX, 256));
        const serializedTx = randomBytes(payloadLength);

        const tx = fuelMessagePortal.sendTransaction(gas, serializedTx, {
          value: parseEther('1'),
        });

        await expect(tx)
          .to.emit(fuelMessagePortal, 'Transaction')
          .withArgs(0, gas, serializedTx);
      });

      it('increments nonces', async () => {
        const { fuelMessagePortal } = await fixture();

        const payloadLength = Math.abs(randomInt(256));
        const gas = Math.abs(randomInt(MIN_GAS_PER_TX, 256));
        const serializedTx = randomBytes(payloadLength);

        await fuelMessagePortal.sendTransaction(gas, serializedTx, {
          value: parseEther('1'),
        });
        const tx = fuelMessagePortal.sendTransaction(gas, serializedTx, {
          value: parseEther('1'),
        });

        await expect(tx)
          .to.emit(fuelMessagePortal, 'Transaction')
          .withArgs(1, gas, serializedTx);
      });

      it('increments used gas', async () => {
        const {
          fuelMessagePortal,
          signers: [signer],
        } = await fixture();

        const payloadLength = Math.abs(randomInt(256));
        const gas = Math.abs(randomInt(MIN_GAS_PER_TX, 256));
        const serializedTx = randomBytes(payloadLength);

        await haltBlockProduction(hre);

        const nonce = await signer.getNonce();

        const tx1 = await fuelMessagePortal
          .connect(signer)
          .sendTransaction(gas, serializedTx, {
            nonce,
            value: parseEther('1'),
          });
        const tx2 = await fuelMessagePortal
          .connect(signer)
          .sendTransaction(gas, serializedTx, {
            nonce: nonce + 1,
            value: parseEther('1'),
          });

        await mine();

        expect((await tx1.wait()).blockNumber).to.be.equal(
          (await tx2.wait()).blockNumber
        );

        expect(await fuelMessagePortal.getUsedGas()).to.be.equal(gas * 2);
      });

      it('initializes gasPrice to MIN_GAS_PRICE', async () => {
        const { fuelMessagePortal } = await fixture();

        const payloadLength = Math.abs(randomInt(256));
        const gas = Math.abs(randomInt(MIN_GAS_PER_TX, 256));
        const serializedTx = randomBytes(payloadLength);

        await fuelMessagePortal.sendTransaction(gas, serializedTx, {
          value: parseEther('1'),
        });

        expect(await fuelMessagePortal.getGasPrice()).to.be.equal(
          await fuelMessagePortal.MIN_GAS_PRICE()
        );
      });

      it('rejects when block is full', async () => {
        const { fuelMessagePortal } = await fixture();

        const payloadLength = Math.abs(randomInt(256));
        const serializedTx = randomBytes(payloadLength);

        const tx = fuelMessagePortal.sendTransaction(
          GAS_LIMIT + 1n,
          serializedTx
        );
        await expect(tx).to.be.revertedWithCustomError(
          fuelMessagePortal,
          'GasLimit'
        );
      });

      it('collects fees', async () => {
        const { fuelMessagePortal } = await fixture();

        const payloadLength = Math.abs(randomInt(256));
        const serializedTx = randomBytes(payloadLength);

        const expectedFee = MIN_GAS_PRICE * GAS_LIMIT;

        const tx = fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
          value: expectedFee,
        });

        await expect(tx).to.changeEtherBalance(fuelMessagePortal, expectedFee);
      });

      it('returns excess fees', async () => {
        const {
          fuelMessagePortal,
          signers: [signer],
        } = await fixture();

        const payloadLength = Math.abs(randomInt(256));
        const serializedTx = randomBytes(payloadLength);

        const expectedFee = MIN_GAS_PRICE * GAS_LIMIT;
        const excessFee = parseEther('1');
        const tx = fuelMessagePortal
          .connect(signer)
          .sendTransaction(GAS_LIMIT, serializedTx, {
            value: expectedFee + excessFee,
          });

        await expect(tx).to.changeEtherBalance(fuelMessagePortal, expectedFee);
        await expect(tx).to.changeEtherBalance(signer, -expectedFee);
      });

      it('reject underfunded transactions', async () => {
        const { fuelMessagePortal } = await fixture();

        const payloadLength = Math.abs(randomInt(256));
        const serializedTx = randomBytes(payloadLength);

        const expectedFee = MIN_GAS_PRICE * GAS_LIMIT;

        const tx = fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
          value: expectedFee - 1n,
        });

        await expect(tx).to.be.revertedWithCustomError(
          fuelMessagePortal,
          'InsufficientFee'
        );

        await fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
          value: expectedFee,
        });
      });

      describe('with increasing congestion (used gas above target)', () => {
        it('duplicates gas price for full blocks gasPrice', async () => {
          const { fuelMessagePortal } = await fixture();

          const payloadLength = Math.abs(randomInt(256));
          const serializedTx = randomBytes(payloadLength);

          await fuelMessagePortal.sendTransaction(1, serializedTx, {
            value: parseEther('1'),
          }); // Initialize to 1 gwei
          const initialGasPrice = await fuelMessagePortal.getGasPrice();
          expect(initialGasPrice).to.equal(
            await fuelMessagePortal.MIN_GAS_PRICE()
          );

          await fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
            value: parseEther('1'),
          }); // Fills a block
          await fuelMessagePortal.sendTransaction(1, serializedTx, {
            value: parseEther('1'),
          }); // Update gas price

          expect(await fuelMessagePortal.getGasPrice()).to.equal(
            initialGasPrice * 2n
          );
        });

        it('multiplies gas price by 1.5 for blocks 1.5 times above gas target', async () => {
          const { fuelMessagePortal } = await fixture();

          const payloadLength = Math.abs(randomInt(256));
          const gas = GAS_TARGET + (GAS_LIMIT - GAS_TARGET) / 2n;
          const serializedTx = randomBytes(payloadLength);

          await fuelMessagePortal.sendTransaction(1, serializedTx, {
            value: parseEther('1'),
          }); // Initialize to 1 gwei
          const initialGasPrice = await fuelMessagePortal.getGasPrice();

          await fuelMessagePortal.sendTransaction(gas, serializedTx, {
            value: parseEther('1'),
          });

          await fuelMessagePortal.sendTransaction(1, serializedTx, {
            value: parseEther('1'),
          }); // Update gas price

          expect(await fuelMessagePortal.getGasPrice()).to.equal(
            (initialGasPrice * ONE_AND_A_HALF) / SCALED_UNIT
          );
        });
      });

      describe('with decreasing congestion (used gas below target)', () => {
        describe('when there are multiple transactions in a row of blocks', () => {
          it('multiplies gas price by 0.75 for blocks with GAS_TARGET / 2', async () => {
            const { fuelMessagePortal } = await fixture();

            const payloadLength = Math.abs(randomInt(256));
            const gas = GAS_TARGET / 2n;
            const serializedTx = randomBytes(payloadLength);

            await Promise.all([
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }), // Initialize to 1 gwei
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }), // Bump to 2 gwei
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }), // Bump to 4 gwei
            ]);

            await fuelMessagePortal.sendTransaction(gas, serializedTx, {
              value: parseEther('1'),
            });

            const initialGasPrice = await fuelMessagePortal.getGasPrice();
            expect(initialGasPrice).to.equal(parseUnits('8', 'gwei'));

            await fuelMessagePortal.sendTransaction(1, serializedTx, {
              value: parseEther('1'),
            }); // Update gas price

            expect(await fuelMessagePortal.getGasPrice()).to.equal(
              (initialGasPrice * 3n) / 4n
            );
          });

          it('multiplies gas price by ~0.5 for blocks with ~0 gas', async () => {
            const { fuelMessagePortal } = await fixture();

            const payloadLength = Math.abs(randomInt(256));
            const gas = 1;
            const serializedTx = randomBytes(payloadLength);

            await Promise.all([
              fuelMessagePortal.sendTransaction(1, serializedTx, {
                value: parseEther('1'),
              }), // Initialize to 1 gwei
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }), // Bump to 2 gwei
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }), // Bump to 4 gwei
            ]);

            await fuelMessagePortal.sendTransaction(gas, serializedTx, {
              value: parseEther('1'),
            });

            const initialGasPrice = await fuelMessagePortal.getGasPrice();
            expect(initialGasPrice).to.equal(parseUnits('4', 'gwei'));

            await fuelMessagePortal.sendTransaction(1, serializedTx, {
              value: parseEther('1'),
            }); // Update gas price

            expect(await fuelMessagePortal.getGasPrice()).to.be.within(
              initialGasPrice / 2n,
              (initialGasPrice * 101n) / 200n
            );
          });

          it('maintains gas price if block hits gas target', async () => {
            const { fuelMessagePortal } = await fixture();

            const payloadLength = Math.abs(randomInt(256));
            const gas = GAS_TARGET;
            const serializedTx = randomBytes(payloadLength);

            await Promise.all([
              fuelMessagePortal.sendTransaction(1, serializedTx, {
                value: parseEther('1'),
              }), // Initialize to 1 gwei
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }), // Bump to 2 gwei
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }), // Bump to 4 gwei
            ]);

            await fuelMessagePortal.sendTransaction(gas, serializedTx, {
              value: parseEther('1'),
            });

            const initialGasPrice = await fuelMessagePortal.getGasPrice();
            expect(initialGasPrice).to.equal(parseUnits('4', 'gwei'));

            await fuelMessagePortal.sendTransaction(1, serializedTx, {
              value: parseEther('1'),
            }); // Update gas price

            expect(await fuelMessagePortal.getGasPrice()).to.equal(
              initialGasPrice
            );
          });
        });

        describe('when transactions are spaced out in a row of block', () => {
          it('divides gasPrice by the distance', async () => {
            const { fuelMessagePortal } = await fixture();

            const payloadLength = Math.abs(randomInt(256));
            const serializedTx = randomBytes(payloadLength);

            await Promise.all([
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }),
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }),
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }),
              fuelMessagePortal.sendTransaction(GAS_TARGET, serializedTx, {
                value: parseEther('1'),
              }),
            ]);

            const initialGasPrice = await fuelMessagePortal.getGasPrice();

            const distance = 3;
            await mine(distance - 1); // The last block will be mined by the tx
            await fuelMessagePortal.sendTransaction(GAS_TARGET, serializedTx, {
              value: parseEther('1'),
            });

            expect(await fuelMessagePortal.getGasPrice()).to.equal(
              initialGasPrice / BigInt(distance)
            );
          });

          it('bottoms gas price at MIN_GAS_PRICE', async () => {
            const { fuelMessagePortal } = await fixture();

            const payloadLength = Math.abs(randomInt(256));
            const serializedTx = randomBytes(payloadLength);

            await Promise.all([
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }),
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }),
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }),
              fuelMessagePortal.sendTransaction(GAS_LIMIT, serializedTx, {
                value: parseEther('1'),
              }),
            ]);

            await mine(200);
            await fuelMessagePortal.sendTransaction(GAS_TARGET, serializedTx, {
              value: parseEther('1'),
            });

            expect(await fuelMessagePortal.getGasPrice()).to.equal(
              MIN_GAS_PRICE
            );
          });
        });
      });
    });

    describe('collectFees()', async () => {
      it('rejects unauthorized calls', async () => {
        const {
          fuelMessagePortal,
          signers: [deployer, mallory],
        } = await fixture();

        const rogueTx = fuelMessagePortal.connect(mallory).collectFees();
        const expectedError = `AccessControl: account ${mallory.address.toLowerCase()} is missing role ${FEE_COLLECTOR_ROLE}`;
        await expect(rogueTx).to.be.revertedWith(expectedError);

        await fuelMessagePortal
          .connect(deployer)
          .grantRole(FEE_COLLECTOR_ROLE, mallory);
        await fuelMessagePortal.connect(mallory).collectFees();
      });

      it('transfers fees to caller', async () => {
        const {
          fuelMessagePortal,
          signers: [deployer, collector],
        } = await fixture();

        await fuelMessagePortal
          .connect(deployer)
          .grantRole(FEE_COLLECTOR_ROLE, collector);

        const expectedFee = MIN_GAS_PRICE * GAS_LIMIT;
        await fuelMessagePortal.sendTransaction(GAS_LIMIT, '0x', {
          value: expectedFee,
        });

        const tx = fuelMessagePortal.connect(collector).collectFees();
        await tx;

        await expect(tx).to.changeEtherBalances(
          [fuelMessagePortal, collector],
          [-expectedFee, expectedFee]
        );
      });
    });
  });
}
