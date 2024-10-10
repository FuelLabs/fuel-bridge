/**
 * This is a stand-alone script that
 * calls the bridge 's withdraw method
 */

import { Proxy } from '@fuel-bridge/fungible-token';

import { Provider } from 'fuels';

let { L2_RPC, L2_BRIDGE_ID } = process.env;
const L1_LLAMA_RPC = 'https://eth.llamarpc.com';
const main = async () => {
  const fuel_provider = await Provider.create(L2_RPC, { resourceCacheTTL: -1 });

  const proxy = new Proxy(L2_BRIDGE_ID, fuel_provider);

  console.log('\t> Checking asset metadata...');

  console.log('Owner', (await proxy.functions._proxy_owner().get()).value);
  console.log('Target', (await proxy.functions.proxy_target().get()).value);
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
