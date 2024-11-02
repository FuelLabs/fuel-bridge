/**
 * This is a stand-alone script that
 * checks the metadata of tokens in the L2 bridge
 * against their L1 counterpart
 */

import { BridgeFungibleToken, Proxy } from '@fuel-bridge/fungible-token';
import { IERC20Metadata__factory } from '@fuel-bridge/solidity-contracts/typechain';
import { JsonRpcProvider, isAddress } from 'ethers';
import type { FuelError } from 'fuels';
import { Provider, isB256 } from 'fuels';

import { debug, getTokenId } from '../utils';

let { L2_ASSET_ID } = process.env;

const { L1_RPC, L2_RPC, L2_BRIDGE_ID, L1_TOKEN_ADDRESS } = process.env;

const L1_LLAMA_RPC = 'https://eth.llamarpc.com';
const main = async () => {
  const fuel_provider = await Provider.create(L2_RPC, { resourceCacheTTL: -1 });

  if (isAddress(L1_TOKEN_ADDRESS)) {
    L2_ASSET_ID = getTokenId(L2_BRIDGE_ID, L1_TOKEN_ADDRESS);
  }

  if (!isB256(L2_ASSET_ID)) {
    console.log('Bad L2_ASSET_ID', L2_ASSET_ID);
    return;
  }

  const proxy = new Proxy(L2_BRIDGE_ID, fuel_provider);

  console.log('\t> Checking asset metadata...');

  debug('Detecting if the bridge is a proxy...');
  await proxy.functions
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

  const bridge = new BridgeFungibleToken(L2_BRIDGE_ID, fuel_provider);

  const asset = { bits: L2_ASSET_ID };

  const call_result = await bridge.functions
    .asset_to_l1_address(asset)
    .dryRun()
    .catch((e: FuelError) => {
      if (e.metadata['logs'] && e.metadata['logs'][0] === 'AssetNotFound') {
        console.log(`Asset ${L2_ASSET_ID} not found, was it ever bridged?`);
      } else {
        console.log(JSON.stringify(e, undefined, 2));
      }

      return null;
    });

  if (!call_result) {
    return;
  }

  const l1_token_address = '0x' + (call_result.value as string).slice(-40);
  console.log('l1_token_address', `${l1_token_address}`);

  const fuel_symbol = (await bridge.functions.symbol(asset).dryRun()).value;
  const fuel_name = (await bridge.functions.name(asset).dryRun()).value;

  if (!fuel_symbol || !fuel_name) {
    console.log('Metadata not registered');
    return;
  }

  console.log('symbol: ', fuel_symbol);
  console.log('name: ', fuel_name);

  const eth_provider = new JsonRpcProvider(L1_RPC || L1_LLAMA_RPC);
  const eth_contract = IERC20Metadata__factory.connect(
    l1_token_address,
    eth_provider
  );

  const eth_name = await eth_contract.name();
  const eth_symbol = await eth_contract.symbol();

  if (eth_name !== fuel_name) {
    console.log('Metadata mismatch on name', fuel_name, eth_name);
  }

  if (eth_symbol !== fuel_symbol) {
    console.log('Metadata mismatch on symbol', fuel_symbol, eth_symbol);
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
