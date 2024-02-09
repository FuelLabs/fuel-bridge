import type { BytesLike } from 'ethers';
import { sha256 } from 'ethers';

// The primary hash function for Fuel.
export default function hash(data: BytesLike): string {
  return sha256(data);
}
