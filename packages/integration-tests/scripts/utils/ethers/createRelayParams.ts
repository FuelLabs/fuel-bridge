import { arrayify, bn, MessageProof } from 'fuels';
import {
  Message,
  MessageBlockHeader,
  CommitBlockHeader,
  Proof,
} from '../../types';
import { TestEnvironment } from '../../setup';
import { getBlock } from '../fuels/getBlock';

export async function createRelayMessageParams(env: TestEnvironment, withdrawMessageProof: MessageProof, blockHashCommited: string) {
  const blockCommited = await getBlock({ blockHash: blockHashCommited, providerUrl: env.fuel.provider.url });
  const prevBlockCommited = await getBlock({ height: bn(blockCommited.header.height).sub(1).toString(), providerUrl: env.fuel.provider.url });

  // construct data objects for relaying message on L1
  const message: Message = {
    sender: withdrawMessageProof.sender.toHexString(),
    recipient: withdrawMessageProof.recipient.toHexString(),
    amount: withdrawMessageProof.amount.toHex(),
    nonce: withdrawMessageProof.nonce,
    data: withdrawMessageProof.data,
  };
  const header = prevBlockCommited.header;
  // const header = withdrawMessageProof.messageBlockHeader;
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
  console.log(`blockHeader`, blockHeader);
  const messageProof = withdrawMessageProof.messageProof;
  // Create the message proof object
  const messageInBlockProof: Proof = {
    key: messageProof.proofIndex.toString(),
    proof: messageProof.proofSet.map((p) => arrayify(p)),
  };

  // construct data objects for relaying message on L1 (cont)
  const rootHeader = blockCommited.header;
  // const rootHeader = withdrawMessageProof.commitBlockHeader;
  const rootBlockHeader: CommitBlockHeader = {
    prevRoot: rootHeader.prevRoot,
    height: rootHeader.height.toString(),
    timestamp: rootHeader.time,
    applicationHash: rootHeader.applicationHash,
  };
  const blockProof = withdrawMessageProof.blockProof;
  // Create the block proof object
  const blockInHistoryProof: Proof = {
    key: blockProof.proofIndex.toString(),
    proof: blockProof.proofSet.map((p) => arrayify(p)),
  };

  return {
    message,
    rootBlockHeader,
    blockHeader,
    blockInHistoryProof,
    messageInBlockProof,
  };
}
