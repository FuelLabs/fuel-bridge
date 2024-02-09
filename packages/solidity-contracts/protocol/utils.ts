// Helper functions for testing
import type { BigNumberish, BytesLike } from 'ethers';
import {
  Wallet,
  toUtf8Bytes,
  keccak256,
  randomBytes,
  toBeHex,
  hexlify,
  solidityPacked,
} from 'ethers';

import type BlockHeader from './blockHeader';
import { ZERO, EMPTY } from './constants';

export const DEPOSIT_TO_CONTRACT_FLAG = keccak256(
  toUtf8Bytes('DEPOSIT_TO_CONTRACT')
).substring(0, 4);

export function randomAddress(): string {
  return Wallet.createRandom().address;
}

export function randomBytes32(): string {
  return hexlify(randomBytes(32));
}

export function tai64Time(millis: number): string {
  const zeroPointOffset = BigInt('4611686018427387914');
  return toBeHex(BigInt(Math.floor(millis / 1000)) + zeroPointOffset);
}

// Computes data for message
export function computeMessageData(
  fuelContractId: string,
  tokenAddress: string,
  tokenId: BigNumberish,
  from: string,
  to: string,
  amount: BigNumberish,
  data?: BytesLike
): string {
  const typings = [
    'bytes32',
    'bytes32',
    'uint256',
    'bytes32',
    'bytes32',
    'uint256',
  ];
  const values: (string | number | bigint | BytesLike | BigNumberish)[] = [
    fuelContractId,
    tokenAddress,
    BigInt(tokenId),
    from,
    to,
    amount,
  ];

  if (data) {
    typings.push('bytes1');
    values.push(DEPOSIT_TO_CONTRACT_FLAG);

    if (data.length > 0) {
      typings.push('bytes');
      values.push(data);
    }
  }

  return solidityPacked(typings, values);
}

// Create a simple block
export function createFuelBlock(
  prevRoot: string,
  blockHeight: number,
  timestamp?: string,
  outputMessagesCount?: string,
  outputMessagesRoot?: string
): BlockHeader {
  const header: BlockHeader = {
    prevRoot: prevRoot ? prevRoot : ZERO,
    height: blockHeight.toString(),
    timestamp: timestamp ? timestamp : '0',
    daHeight: '0',
    txCount: '0',
    outputMessagesCount: outputMessagesCount ? outputMessagesCount : '0',
    txRoot: EMPTY,
    outputMessagesRoot: outputMessagesRoot ? outputMessagesRoot : ZERO,
  };
  return header;
}
