import type { Signature } from 'ethers';
import type { SigningKey } from 'ethers/lib/utils';
import { ethers } from 'hardhat';

// Sign a messag with a signer, returning the signature object (v, r, s components)
export async function componentSign(
  signer: SigningKey,
  message: string
): Promise<Signature> {
  const flatSig = await signer.signDigest(ethers.utils.arrayify(message));
  const sig = ethers.utils.splitSignature(flatSig);
  return sig;
}

// Sign a message with as signer, returning a 64-byte compact ECDSA signature
export async function compactSign(
  signer: SigningKey,
  message: string
): Promise<string> {
  const sig = await componentSign(signer, message);

  const compactSig = sig.r.concat(sig._vs.slice(2));
  return compactSig;
}
