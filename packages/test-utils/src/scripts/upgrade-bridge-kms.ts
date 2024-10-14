/**
 * This is a stand-alone script that upgrades the bridge
 */

import {
  Proxy,
  BridgeFungibleTokenFactory,
  BridgeFungibleToken,
} from '@fuel-bridge/fungible-token';
import { KMSAccount } from '@fuels/kms-account';

import { Provider, TransactionStatus, getRandomB256 } from 'fuels';
import { password } from '@inquirer/prompts';
import { debug } from '../utils';

let { L1_TOKEN_GATEWAY, L2_SIGNER, L2_RPC, L2_BRIDGE_ID, KMS_KEY_ID } =
  process.env;

const main = async () => {
  const provider = await Provider.create(L2_RPC!, { resourceCacheTTL: -1 });
  if (!L2_SIGNER) {
    L2_SIGNER = await password({ message: 'Enter private key' });
  }

  console.log('KMS_KEY_ID');
  const kms_wallet = await KMSAccount.create(KMS_KEY_ID, {}, provider);

  const proxy = new Proxy(L2_BRIDGE_ID!, kms_wallet);

  console.log('\t> L2 Bridge deployment script initiated');
  console.log('\t> Loaded wallet', kms_wallet.address.toB256());
  console.log('\t> Balance: ', (await kms_wallet.getBalance()).toString());

  debug('Detecting if the bridge is a proxy: implementation');
  let current_implementation: string = await proxy.functions
    .proxy_target()
    .dryRun()
    .then((result) => {
      debug('bridge.proxy_target() returned, assuming proxy');
      if (!result.value.bits) {
        return null;
      }
      return result.value.bits;
    })
    .catch((e) => {
      debug(`bridge.proxy_target() failed with error: `);
      debug(`${JSON.stringify(e, undefined, 2)}`);
      return null;
    });
  debug(`Current implementation at ${current_implementation}`);

  debug('Detecting if the bridge is a proxy: owner');
  let owner: string | null = await proxy.functions
    ._proxy_owner()
    .dryRun()
    .then((result) => {
      debug('bridge._proxy.owner() succeeded, assuming proxy');
      if (!result.value.Initialized?.Address?.bits) {
        return null;
      }
      return result?.value?.Initialized?.Address?.bits;
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
    kms_wallet.address.toB256().replace('0x', '').toLowerCase()
  ) {
    console.log(`Owner mismatch, contract owned by ${owner}`);
    return;
  }

  const implConfigurables: any = {
    BRIDGED_TOKEN_GATEWAY:
      '0x000000000000000000000000' +
      L1_TOKEN_GATEWAY!.replace('0x', '').toLowerCase(),
  };

  const salt = getRandomB256();
  const deployOpts = {
    storageSlots: BridgeFungibleToken.storageSlots,
    configurableConstants: implConfigurables,
    salt,
  };

  const factory = new BridgeFungibleTokenFactory(kms_wallet);
  factory.setConfigurableConstants(implConfigurables);
  const { contractId } = factory.createTransactionRequest(deployOpts);

  if (contractId === current_implementation) {
    console.log(`Implementation ${contractId} is already live in the proxy`);
    return;
  }

  const contractExists = (await provider.getContract(contractId)) !== null;

  if (!contractExists) {
    debug('Deploying contract');
    const createTx = await factory.deployAsCreateTx(deployOpts);
    debug('Expected contract ID', contractId);
    debug('Fetching transaction ID');
    const createTxId = await createTx.waitForTransactionId();

    debug(`Deploy transaction ${createTxId} sent, waiting for result`);

    const createTxResult = await createTx.waitForResult();
    if (createTxResult.transactionResult.status !== TransactionStatus.success) {
      console.log('Could not deploy contract');
      debug(JSON.stringify(createTxResult, undefined, 2));
      return;
    }

    if (createTx.contractId !== contractId) {
      console.log('Contract mismatch, aborting');
      return;
    }

    debug('Contract deployment completed');
    debug('Deploy opts', deployOpts);
  }

  console.log('New implementation at ', contractId);

  const contractIdentityInput = { bits: contractId };
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
