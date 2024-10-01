/**
 * This is a stand-alone script that
 * fetches a deposit message and relays it to the bridge
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
} from 'fuels';
import { password } from '@inquirer/prompts';
import {
  FUEL_MESSAGE_TIMEOUT_MS,
  debug,
  relayCommonMessage,
  waitForMessage,
} from '../utils';

const TOKEN_RECIPIENT_DATA_OFFSET = 160;

let { L2_SIGNER, L2_RPC, L2_BRIDGE_ID, L2_MESSAGE_NONCE } = process.env;

const main = async () => {
  if (!L2_RPC) {
    console.log('Must provide L2_RPC');
    return;
  }

  if (!L2_MESSAGE_NONCE) {
    console.log('Must provide L2_MESSAGE_NONCE');
    return;
  }

  const provider = await Provider.create(L2_RPC, { resourceCacheTTL: -1 });

  if (!L2_SIGNER) {
    L2_SIGNER = await password({ message: 'Enter private key' });
  }

  const wallet = Wallet.fromPrivateKey(L2_SIGNER, provider);

  const proxy = new Proxy(L2_BRIDGE_ID, wallet);

  console.log('\t> L2 relay metadata script initiated');
  console.log('\t> Loaded wallet', wallet.address.toB256());
  console.log('\t> Balance: ', (await wallet.getBalance()).toString());

  debug('Detecting if the bridge is a proxy...');
  let implementation_id: string | null = await proxy.functions
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

  const nonce: BN = new BN(L2_MESSAGE_NONCE);

  const message = await waitForMessage(
    provider,
    new Account(predicateRoot).address,
    nonce,
    FUEL_MESSAGE_TIMEOUT_MS
  );

  if (!message) {
    console.log('No messages in the predicate for nonce', nonce.toString());
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
