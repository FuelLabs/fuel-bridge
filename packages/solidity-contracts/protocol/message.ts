import { solidityPacked } from 'ethers';

import hash from './cryptography';

// The Message structure.
class Message {
  constructor(
    public sender: string,
    public recipient: string,
    public amount: bigint,
    public nonce: string,
    public data: string
  ) {}
}

// Computes the message ID.
export function computeMessageId(message: Message): string {
  return hash(
    solidityPacked(
      ['bytes32', 'bytes32', 'bytes32', 'uint64', 'bytes'],
      [
        message.sender,
        message.recipient,
        message.nonce,
        message.amount,
        message.data,
      ]
    )
  );
}

export default Message;
