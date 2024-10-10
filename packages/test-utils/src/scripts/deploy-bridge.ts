/**
 * This is a stand-alone script that deploys the
 * L2 bridge with fuels-ts sdk.
 */

import {
  BridgeFungibleToken,
  BridgeFungibleTokenFactory,
  ProxyFactory,
} from '@fuel-bridge/fungible-token';

import {
  DeployContractResult,
  Provider,
  Wallet,
  WalletUnlocked,
  ZeroBytes32,
} from 'fuels';
import { password } from '@inquirer/prompts';

let { L1_TOKEN_GATEWAY, L2_SIGNER, L2_RPC } = process.env;

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

  console.log('\t> L2 Bridge deployment script initiated');
  console.log('\t> Loaded wallet', wallet.address.toB256());
  console.log('\t> Balance: ', (await wallet.getBalance()).toString());

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

  const proxyConfigurables: any = {
    INITIAL_TARGET: { bits: implementation.id.toB256() },
    INITIAL_OWNER: {
      Initialized: {
        Address: { bits: wallet.address.toB256() },
      },
    },
  };

  const proxy = await ProxyFactory.deploy(wallet, {
    configurableConstants: proxyConfigurables,
    salt: ZeroBytes32,
  })
    .then(fetchIfDeployed(provider, wallet))
    .then(({ contract }) => contract);

  console.log('Proxy at ', proxy.id.toB256());
};

main()
  .then(() => {
    console.log('\t> L2 Bridge deployed successfully');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
