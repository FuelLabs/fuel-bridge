import {
  fungibleTokenBinary,
  bridgeProxyBinary,
  BridgeFungibleTokenAbi__factory,
  ProxyAbi__factory,
} from '@fuel-bridge/fungible-token';

import {
  DeployContractResult,
  Provider,
  Wallet,
  WalletUnlocked,
  ZeroBytes32,
} from 'fuels';
import { eth_address_to_b256 } from '../utils';

const { L1_TOKEN_GATEWAY, L2_SIGNER, L2_RPC } = process.env;

// This helper avoids an exception in case that the contract
// was already deployed, and returns the contract instead
function fetchIfDeployed(provider: Provider, wallet: WalletUnlocked) {
  return async (tx: DeployContractResult) => {
    const contract = await provider.getContract(tx.contractId);

    if (!contract) return tx.waitForResult();
    else
      return {
        contract: BridgeFungibleTokenAbi__factory.connect(contract.id, wallet),
      };
  };
}

const main = async () => {
  const provider = await Provider.create(L2_RPC);
  const wallet = Wallet.fromPrivateKey(L2_SIGNER, provider);

  const implConfigurables: any = {
    BRIDGED_TOKEN_GATEWAY: eth_address_to_b256(
      L1_TOKEN_GATEWAY?.replace('0x', '')
    ),
  };

  const implementation = await BridgeFungibleTokenAbi__factory.deployContract(
    fungibleTokenBinary,
    wallet,
    { configurableConstants: implConfigurables, salt: ZeroBytes32 }
  )
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

  const proxy = await ProxyAbi__factory.deployContract(
    bridgeProxyBinary,
    wallet,
    {
      configurableConstants: proxyConfigurables,
      salt: ZeroBytes32,
    }
  )
    .then(fetchIfDeployed(provider, wallet))
    .then(({ contract }) => contract);

  console.log('Proxy at ', proxy.id.toB256());
};

main()
  .then(() => {
    console.log('\t> Bridge deployed successfully');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
