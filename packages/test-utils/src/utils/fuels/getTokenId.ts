import type { BytesLike } from 'ethers';
import { concat, dataLength, sha256, zeroPadValue } from 'ethers';
import type { Contract } from 'fuels';
import { ZeroBytes32 } from 'fuels';

export function getTokenId(
  contract: Contract,
  tokenAddress: BytesLike,
  tokenId: BytesLike = ZeroBytes32
) {
  if (dataLength(tokenAddress) < 32)
    tokenAddress = zeroPadValue(tokenAddress, 32);

  if (dataLength(tokenId) < 32) tokenId = zeroPadValue(tokenId, 32);

  const subId = sha256(concat([tokenAddress, tokenId]));
  const assetId = sha256(concat([contract.id.toHexString(), subId]));

  return assetId;
}
