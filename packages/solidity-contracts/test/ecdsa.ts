import chai from 'chai';
import { SigningKey, randomBytes, hexlify, ZeroHash, toBeHex } from 'ethers';
import { ethers } from 'hardhat';

import { componentSign } from '../protocol/validators';
import type { MockCryptography } from '../typechain';

const { expect } = chai;

const SECP256K1N = BigInt(
  '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'
);

describe('ECDSA', async () => {
  let mockCrypto: MockCryptography;
  let signer: SigningKey;
  before(async () => {
    mockCrypto = await ethers.deployContract('MockCryptography');

    signer = new SigningKey(
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
    );
  });

  it('rejects component signatures with high s-value', async () => {
    const msg = hexlify(randomBytes(32));
    const sig = await componentSign(signer, msg);
    const vOrig = BigInt(sig.v) - 27n; // take v as 0 or 1

    // flip v and ensure it is 27 or 28
    const vFlipped = (vOrig ^ 1n) + 27n;
    // flip s to secp256k1n - original s. This defines a unique
    // signature over the same data, which we want to reject.
    const sFlipped = SECP256K1N - BigInt(sig.s);
    const badSig = { v: vFlipped, r: sig.r, s: toBeHex(sFlipped) };

    await expect(
      mockCrypto.addressFromSignatureComponents(
        badSig.v,
        badSig.r,
        badSig.s,
        msg
      )
    ).to.be.revertedWith('signature-invalid-s');
  });

  it('rejects component signatures from the zero address', async () => {
    const msg = hexlify(randomBytes(32));
    const sig = componentSign(signer, msg);
    // an r value < 1 makes the signature invalid. ecrecover will return 0x0
    const badSig = { v: sig.v, r: ZeroHash, s: sig.s };

    await expect(
      mockCrypto.addressFromSignatureComponents(
        badSig.v,
        badSig.r,
        badSig.s,
        msg
      )
    ).to.be.revertedWith('signature-invalid');
  });

  it('rejects invalid compact signatures', async () => {
    const msg = hexlify(randomBytes(32));
    const sig = componentSign(signer, msg);

    // an r value < 1 makes the signature invalid. ecrecover will return 0x0
    const badRValue = ZeroHash;

    const badSigCompact = badRValue.concat(sig.yParityAndS.slice(2));
    await expect(
      mockCrypto.addressFromSignature(badSigCompact, msg)
    ).to.be.revertedWith('signature-invalid');
    // // signature too short

    const shortSig = sig.r.concat(sig.yParityAndS.slice(4));
    await expect(
      mockCrypto.addressFromSignature(shortSig, msg)
    ).to.be.revertedWith('signature-invalid-length');

    // signature too long

    const longSig = sig.r.concat(sig.yParityAndS.slice(2)).concat('aa');
    await expect(
      mockCrypto.addressFromSignature(longSig, msg)
    ).to.be.revertedWith('signature-invalid-length');
  });
});
