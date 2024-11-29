/**
 * This is a stand-alone script that
 * fetches a deposit message and relays it to the bridge
 */

import { Proxy } from '@fuel-bridge/fungible-token';
import { contractMessagePredicate } from '@fuel-bridge/message-predicates';
import { password } from '@inquirer/prompts';
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

let { L2_SIGNER } = process.env;

const { L2_RPC, L2_BRIDGE_ID, L2_MESSAGE_NONCE, L2_TOKEN_RECEIVER } =
  process.env;

const main = async () => {
  const provider = await Provider.create(L2_RPC, { resourceCacheTTL: -1 });

  if (!L2_SIGNER) {
    L2_SIGNER = await password({ message: 'Enter private key' });
  }

  const wallet = Wallet.fromPrivateKey(L2_SIGNER, provider);

  const proxy = new Proxy(L2_BRIDGE_ID, wallet);

  console.log('\t> L2 Bridge deployment script initiated');
  console.log('\t> Loaded wallet', wallet.address.toB256());
  console.log('\t> Balance: ', (await wallet.getBalance()).toString());

  debug('Detecting if the bridge is a proxy...');
  const implementation_id: string | null = await proxy.functions
    .proxy_target()
    .dryRun()
    .then((result) => {
      debug(`.proxy_target() returned ${result.value.bits}, assuming proxy`);
      return result.value.bits;
    })
    .catch(() => {
      debug('.proxy_target() errored, assuming not proxy');
      return null;
    });

  const predicateRoot = getPredicateRoot(contractMessagePredicate);

  let nonce: BN;
  let endCursor: string | undefined;

  if (L2_MESSAGE_NONCE) nonce = new BN(L2_MESSAGE_NONCE);
  // eslint-disable-next-line no-constant-condition
  else
    while (true) {
      const response = await provider.getMessages(predicateRoot, {
        after: endCursor,
      });

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
        if (response.pageInfo.hasNextPage) {
          endCursor = response.pageInfo.endCursor;
          continue;
        } else {
          console.log('No messages for the recipient');
          return;
        }
      }

      nonce = new BN(message.nonce);
      break;
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
    console.log(
      '\t > Minted asset IDs: ',
      txResult.mintedAssets.map((asset) => asset.assetId)
    );
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
