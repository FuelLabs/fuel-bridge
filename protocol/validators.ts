import { ethers } from 'hardhat';
import { Signature } from 'ethers';
import { SigningKey } from 'ethers/lib/utils';

// Sign a messag with a signer, returning the signature object (v, r, s components)
export async function componentSign(signer: SigningKey, message: string): Promise<Signature> {
	const flatSig = await signer.signDigest(ethers.utils.arrayify(message));
	const sig = ethers.utils.splitSignature(flatSig);
	return sig;
}

// Sign a message with as signer, returning a 64-byte compact ECDSA signature
export async function compactSign(signer: SigningKey, message: string): Promise<string> {
	const sig = await componentSign(signer, message);
	// eslint-disable-next-line no-underscore-dangle
	const compactSig = sig.r.concat(sig._vs.slice(2));
	return compactSig;
}
