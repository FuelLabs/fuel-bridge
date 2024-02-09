import { concat, sha256 } from 'ethers';
import type { Contract } from 'fuels';
import { ZeroBytes32 } from 'fuels';

export function getTokenId(contract: Contract, subId = ZeroBytes32) {
  return sha256(concat([contract.id.toHexString(), subId]));
}
