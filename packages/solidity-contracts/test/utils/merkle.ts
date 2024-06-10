// Merkle tree node structure

import { getProof } from '@fuel-ts/merkle';

import type BlockHeader from '../../protocol/blockHeader';
import type Message from '../../protocol/message';
import { computeMessageId } from '../../protocol/message';

// Contract constants
export const TIME_TO_FINALIZE = 10800;
export const COMMIT_COOLDOWN = 10800;
export const BLOCKS_PER_COMMIT_INTERVAL = 10800;

// TODO: should be importable from @fuel-ts/merkle
export type TreeNode = {
  left: number;
  right: number;
  parent: number;
  hash: string;
  data: string;
  index: number;
};

// Merkle proof class
export type MerkleProof = {
  key: number;
  proof: string[];
};

// Get proof for the leaf
export function getLeafIndexKey(nodes: TreeNode[], data: string): number {
  for (let n = 0; n < nodes.length; n += 1) {
    if (nodes[n].data === data) {
      return nodes[n].index;
    }
  }
  return 0;
}

// Helper function to setup test data
export function generateProof(
  message: Message,
  blockHeaders: BlockHeader[],
  prevBlockNodes: TreeNode[],
  blockIds: string[],
  messageNodes: TreeNode[],
  prevBlockDistance = 1
): [string, BlockHeader, MerkleProof, MerkleProof] {
  const messageBlockIndex = BLOCKS_PER_COMMIT_INTERVAL - 1 - prevBlockDistance;
  const messageBlockHeader = blockHeaders[messageBlockIndex];
  const messageBlockLeafIndexKey = getLeafIndexKey(
    prevBlockNodes,
    blockIds[messageBlockIndex]
  );

  const blockInHistoryProof = {
    key: messageBlockLeafIndexKey,
    proof: getProof(prevBlockNodes, messageBlockLeafIndexKey),
  };
  const messageID = computeMessageId(message);
  const messageLeafIndexKey = getLeafIndexKey(messageNodes, messageID);
  const messageInBlockProof = {
    key: messageLeafIndexKey,
    proof: getProof(messageNodes, messageLeafIndexKey),
  };
  return [
    messageID,
    messageBlockHeader,
    blockInHistoryProof,
    messageInBlockProof,
  ];
}
