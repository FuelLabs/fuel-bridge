import { concat, sha256 } from 'ethers/lib/utils';
import { Contract, ZeroBytes32 } from 'fuels';

export function getTokenId(contract: Contract) {
  return sha256(concat([contract.id.toHexString(), ZeroBytes32]));
}
