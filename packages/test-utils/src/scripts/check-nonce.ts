/**
 * This is a stand-alone script that looks for a message nonce
 */

import type { Message } from 'fuels';
import { BN, Provider } from 'fuels';

const { L2_RPC, L2_MESSAGE_NONCE } = process.env;

const main = async () => {
  if (!L2_MESSAGE_NONCE) {
    console.log('Specify L2_MESSAGE_NONCE');
    return;
  }

  if (!L2_RPC) {
    console.log('Specify L2_RPC');
    return;
  }

  const provider = await Provider.create(L2_RPC, { resourceCacheTTL: -1 });

  const message: Message = await provider
    .getMessageByNonce(new BN(L2_MESSAGE_NONCE).toHex(32))
    .catch((e) => {
      console.log(JSON.stringify(e, undefined, 2));
      return null;
    });

  if (!message) {
    console.log('Could not fetch message');
  }

  console.log(message);
};

main()
  .then(() => {
    console.log('\t> Finished');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
