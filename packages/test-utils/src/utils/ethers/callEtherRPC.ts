// Makes a low level JSON RPC method call
export function callEtherRPC(jsonRPC: string, method: string, params: [any]) {
  return fetch(jsonRPC, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: 0,
    }),
  }).then((res) => res.json());
}
