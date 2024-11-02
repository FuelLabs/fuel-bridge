/**
 * This is a stand-alone script that self-transfers
 * to convert a message coin into a coin utxo
 */

import { password } from '@inquirer/prompts';
import { Provider, TransactionStatus, Wallet } from 'fuels';

let { L2_SIGNER } = process.env;
const { L2_RPC } = process.env;

const main = async () => {
  if (!L2_RPC) {
    console.log('Must provide L2_RPC');
    return;
  }

  const provider = await Provider.create(L2_RPC, { resourceCacheTTL: -1 });

  if (!L2_SIGNER) {
    L2_SIGNER = await password({ message: 'Enter private key' });
  }

  const wallet = Wallet.fromPrivateKey(L2_SIGNER, provider);
  const balance = await wallet.getBalance();
  const tx = await wallet.transfer(wallet.address, balance.div(2));

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
