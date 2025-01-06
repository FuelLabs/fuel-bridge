import type { BytesLike } from 'ethers';
import { concat, dataLength, sha256, zeroPadValue, toUtf8Bytes } from 'ethers';
import type { Contract } from 'fuels';
import { ZeroBytes32 } from 'fuels';

export function getTokenId(
  contract: Contract | string,
  tokenAddress: BytesLike,
  tokenId: BytesLike = ZeroBytes32,
  chainId: string = '1'
) {
  if (dataLength(tokenAddress) < 32)
    tokenAddress = zeroPadValue(tokenAddress, 32);

  if (dataLength(tokenId) < 32) tokenId = zeroPadValue(tokenId, 32);

  const id =
    typeof contract === 'object' ? contract.id.toHexString() : contract;

  const subId = sha256(concat([toUtf8Bytes(chainId), tokenAddress, tokenId]));
  const assetId = sha256(concat([id, subId]));

  return assetId;
}
