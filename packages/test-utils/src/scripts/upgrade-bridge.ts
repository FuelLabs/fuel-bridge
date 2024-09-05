/**
 * This is a stand-alone script that upgrades the bridge
 */

import {
  Proxy,
  BridgeFungibleTokenFactory,
  BridgeFungibleToken,
} from '@fuel-bridge/fungible-token';

import {
  DeployContractResult,
  Provider,
  Wallet,
  WalletUnlocked,
  ZeroBytes32,
} from 'fuels';
import { password } from '@inquirer/prompts';
import { debug } from '../utils';

let { L1_TOKEN_GATEWAY, L2_SIGNER, L2_RPC, L2_BRIDGE_ID } = process.env;

// This helper avoids an exception in the case that the contract
// was already deployed, and returns the contract instead
function fetchIfDeployed(provider: Provider, wallet: WalletUnlocked) {
  return async (tx: DeployContractResult) => {
    const contract = await provider.getContract(tx.contractId);

    if (!contract) return tx.waitForResult();
    else {
      await tx.waitForResult().catch(() => {});
      return {
        contract: new BridgeFungibleToken(contract.id, wallet),
      };
    }
  };
}

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
  let owner: string | null = await proxy.functions
    ._proxy_owner()
    .dryRun()
    .then((result) => {
      debug('bridge._proxy.owner() succeeded, assuming proxy');
      return result.value.Initialized.Address.bits;
    })
    .catch((e) => {
      debug(`bridge._proxy_owner() failed with error: `);
      debug(`${JSON.stringify(e, undefined, 2)}`);
      return null;
    });

  if (owner === null) {
    console.log('Could not fetch the bridge owner, is it a proxy?');
    return;
  }

  if (
    owner.replace('0x', '').toLowerCase() !==
    wallet.address.toB256().replace('0x', '').toLowerCase()
  ) {
    console.log(`Owner mismatch, contract owned by ${owner}`);
    return;
  }

  const implConfigurables: any = {
    BRIDGED_TOKEN_GATEWAY:
      '0x000000000000000000000000' +
      L1_TOKEN_GATEWAY.replace('0x', '').toLowerCase(),
  };

  const implementation = await BridgeFungibleTokenFactory.deploy(wallet, {
    configurableConstants: implConfigurables,
    salt: ZeroBytes32,
  })
    .then(fetchIfDeployed(provider, wallet))
    .then(({ contract }) => contract);

  console.log('Implementation at ', implementation.id.toB256());

  const contractIdentityInput = { bits: implementation.id.toB256() };
  const tx = await proxy.functions
    .set_proxy_target(contractIdentityInput)
    .call();

  console.log('\tTransaction ID: ', tx.transactionId);
  await tx.waitForResult();
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
