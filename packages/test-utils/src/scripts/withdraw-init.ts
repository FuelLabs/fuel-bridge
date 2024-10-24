/**
 * This is a stand-alone script that
 * calls the bridge 's withdraw method
 */

import { BridgeFungibleToken, Proxy } from '@fuel-bridge/fungible-token';
import { password } from '@inquirer/prompts';
import { isAddress, parseUnits } from 'ethers';
import type { AbstractContract } from 'fuels';
import { BN, Provider, TransactionStatus, Wallet, isB256 } from 'fuels';

import { debug, eth_address_to_b256 } from '../utils';

let { L2_SIGNER } = process.env;

const { L2_ASSET_ID, L2_RPC, L2_BRIDGE_ID, AMOUNT, L1_TOKEN_RECEIVER } =
  process.env;

const main = async () => {
  const provider = await Provider.create(L2_RPC, { resourceCacheTTL: -1 });

  if (!L2_SIGNER) {
    L2_SIGNER = await password({ message: 'Enter private key' });
  }

  if (!isAddress(L1_TOKEN_RECEIVER)) {
    console.log('Bad L1_TOKEN_RECEIVER', L1_TOKEN_RECEIVER);
    return;
  }

  if (!isB256(L2_ASSET_ID)) {
    console.log('Bad L2_ASSET_ID', L2_ASSET_ID);
    return;
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

  const bridge = new BridgeFungibleToken(L2_BRIDGE_ID, wallet);

  const contract_inputs: AbstractContract[] = [proxy];
  if (implementation_id)
    contract_inputs.push(new BridgeFungibleToken(implementation_id, wallet));

  const decimals = (
    await bridge.functions.decimals({ bits: L2_ASSET_ID }).dryRun()
  ).value;
  const amount = new BN(parseUnits(AMOUNT, decimals).toString());

  const tx_request = await bridge.functions
    .withdraw(eth_address_to_b256(L1_TOKEN_RECEIVER.replace('0x', '')))
    .addContracts(contract_inputs)
    .callParams({
      forward: {
        amount,
        assetId: L2_ASSET_ID,
      },
    })
    .fundWithRequiredCoins();

  const costs = await wallet.getTransactionCost(tx_request);
  tx_request.gasLimit = costs.gasUsed;
  tx_request.maxFee = costs.maxFee;

  const tx = await wallet.sendTransaction(tx_request, {
    estimateTxDependencies: true,
  });

  console.log('\tTransaction ID: ', tx.id);
  const txResult = await provider
    .getTransactionResponse(tx.id)
    .then((response) => response.waitForResult());

  if (txResult.status === TransactionStatus.success) {
    console.log('\t> Transaction succeeded');
    console.log('\t> Burned asset IDs: ', txResult.burnedAssets.join(','));
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
