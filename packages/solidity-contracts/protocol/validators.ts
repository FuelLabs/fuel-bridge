import type { SigningKey } from 'ethers';
import { zeroPadValue } from 'ethers';

// Sign a message with a signer, returning the signature object (v, r, s components)
export function componentSign(signer: SigningKey, message: string) {
  return signer.sign(zeroPadValue(message, 32));
}

// Sign a message with as signer, returning a 64-byte compact ECDSA signature
export function compactSign(signer: SigningKey, message: string) {
  return componentSign(signer, message).compactSerialized;
}
