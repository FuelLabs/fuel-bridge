import { utils, BytesLike } from 'ethers';

// The primary hash function for Fuel.
export default function hash(data: BytesLike): string {
  return utils.sha256(data);
}
