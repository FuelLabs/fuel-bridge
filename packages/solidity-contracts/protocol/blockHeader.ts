import { solidityPacked } from 'ethers';

import hash from './cryptography';

// The BlockHeader structure.
class BlockHeader {
  constructor(
    // Consensus
    public prevRoot: string,
    public height: string,
    public timestamp: string,

    // Application
    public daHeight: string,
    public txCount: string,
    public outputMessagesCount: string,
    public txRoot: string,
    public outputMessagesRoot: string,
    public consensusParametersVersion: bigint,
    public stateTransitionBytecodeVersion: bigint,
    public eventInboxRoot: string
  ) {}
}

// Serialize a block application header.
export function serializeApplicationHeader(blockHeader: BlockHeader): string {
  return solidityPacked(
    [
      'uint64',
      'uint32',
      'uint32',
      'uint16',
      'uint32',
      'bytes32',
      'bytes32',
      'bytes32',
    ],
    [
      blockHeader.daHeight,
      blockHeader.consensusParametersVersion,
      blockHeader.stateTransitionBytecodeVersion,
      blockHeader.txCount,
      blockHeader.outputMessagesCount,
      blockHeader.txRoot,
      blockHeader.outputMessagesRoot,
      blockHeader.eventInboxRoot,
    ]
  );
}

// Produce the block application header hash.
export function computeApplicationHeaderHash(blockHeader: BlockHeader): string {
  return hash(serializeApplicationHeader(blockHeader));
}

// Serialize a block consensus header.
export function serializeConsensusHeader(blockHeader: BlockHeader): string {
  return solidityPacked(
    ['bytes32', 'uint32', 'uint64', 'bytes32'],
    [
      blockHeader.prevRoot,
      blockHeader.height,
      blockHeader.timestamp,
      computeApplicationHeaderHash(blockHeader),
    ]
  );
}

// Produce the block consensus header hash.
export function computeConsensusHeaderHash(blockHeader: BlockHeader): string {
  return hash(serializeConsensusHeader(blockHeader));
}

// Produce the block ID (aka the consensus header hash).
export function computeBlockId(blockHeader: BlockHeader): string {
  return computeConsensusHeaderHash(blockHeader);
}

// The BlockHeader structure with only consensus data.
export class BlockHeaderLite {
  constructor(
    // Consensus
    public prevRoot: string,
    public height: string,
    public timestamp: string,
    public applicationHash: string
  ) {}
}

// Generates the lite version of the block header.
export function generateBlockHeaderLite(
  blockHeader: BlockHeader
): BlockHeaderLite {
  const header: BlockHeaderLite = {
    prevRoot: blockHeader.prevRoot,
    height: blockHeader.height,
    timestamp: blockHeader.timestamp,
    applicationHash: computeApplicationHeaderHash(blockHeader),
  };

  return header;
}

export default BlockHeader;
