/**
 * This is a stand-alone script that looks an address' balances
 */

import { password } from '@inquirer/prompts';
import { Provider, WalletUnlocked } from 'fuels';

let { L2_ADDRESS } = process.env;
const { L2_RPC } = process.env;

const main = async () => {
  const provider = await Provider.create(L2_RPC, { resourceCacheTTL: -1 });

  if (!L2_ADDRESS) {
    const privKey = await password({ message: 'Enter private key' });
    const wallet = new WalletUnlocked(privKey);
    L2_ADDRESS = wallet.address.toB256();
  }

  await provider.getBalances(L2_ADDRESS).then(console.log);
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
