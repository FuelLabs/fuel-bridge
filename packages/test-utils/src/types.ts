// The BlockHeader structure.
export type MessageBlockHeader = {
  prevRoot: string;
  height: string;
  timestamp: string;
  daHeight: string;
  txCount: string;
  outputMessagesCount: string;
  txRoot: string;
  outputMessagesRoot: string;
};

// The BlockHeader structure.
export type CommitBlockHeader = {
  prevRoot: string;
  height: string;
  timestamp: string;
  applicationHash: string;
};

// The MessageOut structure.
export type Message = {
  sender: string;
  recipient: string;
  amount: string;
  nonce: string;
  data: string;
};

export type Proof = {
  key: string;
  proof: Array<Uint8Array>;
};
