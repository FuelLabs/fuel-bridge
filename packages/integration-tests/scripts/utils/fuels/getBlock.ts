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
        messageReceiptRoot
        messageReceiptCount
        time
        id
      }
    }
  }
`;

export interface Block {
  id: string
  header: Header
}

export interface Header {
  prevRoot: string
  transactionsCount: string
  applicationHash: string
  transactionsRoot: string
  height: string
  daHeight: string
  messageReceiptRoot: string
  messageReceiptCount: string
  time: string
  id: string
}

export function getBlock(providerUrl: string, blockId: string): Promise<Block> {
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
  .then((res) => res.data.block);
}
