/**
 * This is a stand-alone script that deploys the
 * fetches a deposit messages and relays it to the bridge
 */

import { Proxy } from '@fuel-bridge/fungible-token';

import { contractMessagePredicate } from '@fuel-bridge/message-predicates';

import {
  Account,
  BN,
  Provider,
  TransactionStatus,
  Wallet,
  getPredicateRoot,
  hexlify,
} from 'fuels';
import {
  FUEL_MESSAGE_TIMEOUT_MS,
  debug,
  relayCommonMessage,
  waitForMessage,
} from '../utils';

const TOKEN_RECIPIENT_DATA_OFFSET = 160;

const { L2_SIGNER, L2_RPC, L2_BRIDGE_ID, L2_MESSAGE_NONCE, L2_TOKEN_RECEIVER } =
  process.env;

const main = async () => {
  const provider = await Provider.create(L2_RPC, { resourceCacheTTL: -1 });
  const wallet = Wallet.fromPrivateKey(L2_SIGNER, provider);

  const proxy = new Proxy(L2_BRIDGE_ID, wallet);

  console.log('\t> L2 Bridge deployment script initiated');
  console.log('\t> Loaded wallet', wallet.address.toB256());
  console.log('\t> Balance: ', (await wallet.getBalance()).toString());

  debug('Detecting if the bridge is a proxy...');
  let implementation_id: string | null = await proxy.functions
    .proxy_target()
    .dryRun()
    .then((result) => {
      debug('bridge_proxy.target() succeeded, assuming proxy');
      return result.value.bits;
    })
    .catch(() => {
      debug('bridge.proxy_target() errored, assuming not proxy');
      return null;
    });

  const predicateRoot = getPredicateRoot(contractMessagePredicate);

  let nonce: BN;

  if (L2_MESSAGE_NONCE) nonce = new BN(L2_MESSAGE_NONCE);
  else {
    const response = await provider.getMessages(predicateRoot);
    if (!response.messages || response.messages.length === 0) {
      console.log('No messages in the predicate');
      return;
    }

    const { messages } = response;

    const message = messages.find((message) => {
      const hex = hexlify(message.data).replace('0x', '');
      const recipient = hex.substring(
        TOKEN_RECIPIENT_DATA_OFFSET * 2,
        TOKEN_RECIPIENT_DATA_OFFSET * 2 + 64 // Recipient is 32 bytes
      );
      const expectedRecipient = L2_TOKEN_RECEIVER || wallet.address.toB256();

      return recipient === expectedRecipient.replace('0x', '');
    });

    if (!message) {
      console.log('No messages for the recipient');
      return;
    }

    nonce = new BN(message.nonce);
  }

  const message = await waitForMessage(
    provider,
    new Account(predicateRoot).address,
    nonce,
    FUEL_MESSAGE_TIMEOUT_MS
  );

  if (!message) {
    console.log('No messages in the predicate');
    return;
  }

  const tx = await relayCommonMessage(wallet, message, {
    contractIds: implementation_id && [implementation_id],
  });

  console.log('\tTransaction ID: ', tx.id);
  const txResult = await tx.waitForResult();

  if (txResult.status === TransactionStatus.success) {
    console.log('\t> Transaction succeeded');
  } else {
    console.log('\t> Transaction errored');
  }
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
