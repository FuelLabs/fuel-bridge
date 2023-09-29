// Helper functions for testing
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber as BN, BigNumber, ethers } from 'ethers';

import type BlockHeader from './blockHeader';
import { ZERO, EMPTY } from './constants';
import hash from './cryptography';

export function randomAddress(): string {
  return hash(
    BN.from(Math.floor(Math.random() * 1_000_000)).toHexString()
  ).slice(0, 42);
}

export function randomBytes32(): string {
  return hash(BN.from(Math.floor(Math.random() * 1_000_000)).toHexString());
}

export function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function randomBytes(length: number): string {
  return hash(
    BN.from(Math.floor(Math.random() * 1_000_000)).toHexString()
  ).slice(0, length * 2 + 2);
}

export function uintToBytes32(i: number): string {
  const value = BN.from(i).toHexString();
  let trimmedValue = value.slice(2);
  trimmedValue = '0'.repeat(64 - trimmedValue.length).concat(trimmedValue);
  return '0x'.concat(trimmedValue);
}

export function padUint(value: BN): string {
  // uint256 is encoded as 32 bytes, so pad that string.
  let trimmedValue = value.toHexString().slice(2);
  trimmedValue = '0'.repeat(64 - trimmedValue.length).concat(trimmedValue);
  return '0x'.concat(trimmedValue);
}

export function padBytes(value: string): string {
  let trimmedValue = value.slice(2);
  trimmedValue = '0'.repeat(64 - trimmedValue.length).concat(trimmedValue);
  return '0x'.concat(trimmedValue);
}

export function tai64Time(millis: number): string {
  const zeroPointOffset = '4611686018427387914';
  return BN.from(Math.floor(millis / 1000))
    .add(zeroPointOffset)
    .toHexString();
}

// Computes data for message
export function computeMessageData(
  fuelContractId: string,
  tokenAddress: string,
  tokenId: BigNumberish,
  from: string,
  to: string,
  amount: number,
  data?: BytesLike
): string {
  if (data) {
    const depositToContractFlag = ethers.utils
      .keccak256(ethers.utils.toUtf8Bytes('DEPOSIT_TO_CONTRACT'))
      .substring(0, 4);
    if (data.length == 0) {
      return ethers.utils.solidityPack(
        [
          'bytes32',
          'bytes32',
          'uint256',
          'bytes32',
          'bytes32',
          'uint256',
          'bytes1',
        ],
        [
          fuelContractId,
          tokenAddress,
          BigNumber.from(tokenId),
          from,
          to,
          amount,
          depositToContractFlag,
        ]
      );
    } else {
      return ethers.utils.solidityPack(
        [
          'bytes32',
          'bytes32',
          'uint256',
          'bytes32',
          'bytes32',
          'uint256',
          'bytes1',
          'bytes',
        ],
        [
          fuelContractId,
          tokenAddress,
          BigNumber.from(tokenId),
          from,
          to,
          amount,
          depositToContractFlag,
          data,
        ]
      );
    }
  }
  return ethers.utils.solidityPack(
    ['bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes32', 'uint256'],
    [fuelContractId, tokenAddress, BigNumber.from(tokenId), from, to, amount]
  );
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
