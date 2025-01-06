import { debug } from '../debug';

const query = `
  query Block($id: BlockId!) {
    block(id: $id) {
      id
      header {
        prevRoot
        transactionsCount
        applicationHash
        transactionsRoot
        height
        daHeight
        transactionsCount
        messageOutboxRoot
        messageReceiptCount
        time
        id
      }
    }
  }
`;

export interface Block {
  id: string;
  header: Header;
}

export interface Header {
  prevRoot: string;
  transactionsCount: string;
  applicationHash: string;
  transactionsRoot: string;
  height: string;
  daHeight: string;
  messageOutboxRoot: string;
  messageReceiptCount: string;
  time: string;
  id: string;
}

export function getBlock(providerUrl: string, blockId: string): Promise<Block> {
  debug(`Fetching block with id ${blockId}`);
  return fetch(providerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        id: blockId,
      },
    }),
  })
    .then((res) => res.json())
    .then((res: any) => {
      if (!res.data.block)
        throw new Error(`Could not fetch block with id ${blockId}`);
      return res.data.block;
    });
}
