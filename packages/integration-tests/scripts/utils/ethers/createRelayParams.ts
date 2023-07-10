import { arrayify, MessageProof } from 'fuels';
import { Message, MessageBlockHeader, CommitBlockHeader, Proof } from '../../types';

export function createRelayMessageParams(withdrawMessageProof: MessageProof) {
  // construct data objects for relaying message on L1
  const message: Message = {
    sender: withdrawMessageProof.sender.toHexString(),
    recipient: withdrawMessageProof.recipient.toHexString(),
    amount: withdrawMessageProof.amount.toHex(),
    nonce: withdrawMessageProof.nonce,
    data: withdrawMessageProof.data,
  };
  const header = withdrawMessageProof.messageBlockHeader;
  const blockHeader: MessageBlockHeader = {
    prevRoot: header.prevRoot,
    height: header.height.toString(),
    timestamp: header.time,
    daHeight: header.daHeight.toString(),
    txCount: header.transactionsCount.toString(),
    txRoot: header.transactionsRoot,
    outputMessagesRoot: header.messageReceiptRoot,
    outputMessagesCount: header.messageReceiptCount.toString(),
  };
  const messageProof = withdrawMessageProof.messageProof;
  const messageProofSet = messageProof.proofSet;
  // TODO: update this when fuel-core remove the first proof from the set
  messageProofSet.shift();
  // Create the message proof object
  const messageInBlockProof: Proof = {
    key: messageProof.proofIndex.toString(),
    proof: messageProofSet.map((p) => arrayify(p)),
  };

  // construct data objects for relaying message on L1 (cont)
  const rootHeader = withdrawMessageProof.commitBlockHeader;
  const rootBlockHeader: CommitBlockHeader = {
    prevRoot: rootHeader.prevRoot,
    height: rootHeader.height.toString(),
    timestamp: rootHeader.time,
    applicationHash: rootHeader.applicationHash,
  };
  const blockProof = withdrawMessageProof.blockProof;
  let proofSet = blockProof.proofSet;
  // TODO: update this when fuel-core remove the first proof from the set
  proofSet.shift();
  // Create the block proof object
  const blockInHistoryProof: Proof = {
    key: blockProof.proofIndex.toString(),
    proof: proofSet.map((p) => arrayify(p)),
  };

  return {
    message,
    rootBlockHeader,
    blockHeader,
    blockInHistoryProof,
    messageInBlockProof,
  };
}
