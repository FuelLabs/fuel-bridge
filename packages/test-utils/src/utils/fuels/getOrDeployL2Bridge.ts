import {
  BridgeFungibleToken,
  BridgeFungibleTokenFactory,
  Proxy,
  ProxyFactory,
} from '@fuel-bridge/fungible-token';
import { resolveAddress, type AddressLike } from 'ethers';

import { debug } from '../logs';
import { eth_address_to_b256 } from '../parsers';
import type { TestEnvironment } from '../setup';

const { FUEL_FUNGIBLE_TOKEN_ADDRESS } = process.env;

export async function getOrDeployL2Bridge(
  env: TestEnvironment,
  ethTokenGateway: AddressLike
) {
  ethTokenGateway = await resolveAddress(ethTokenGateway);

  const tokenGateway = ethTokenGateway.replace('0x', '');
  const fuelAcct = env.fuel.signers[1];

  let l2Bridge: BridgeFungibleToken;
  let proxy: Proxy;
  let implementation: BridgeFungibleToken;

  if (FUEL_FUNGIBLE_TOKEN_ADDRESS) {
    try {
      proxy = new Proxy(FUEL_FUNGIBLE_TOKEN_ADDRESS, fuelAcct);

      const { value: implementationContractId } = await proxy.functions
        .proxy_target()
        .dryRun();

      implementation = new BridgeFungibleToken(
        implementationContractId.bits,
        fuelAcct
      );

      l2Bridge = new BridgeFungibleToken(FUEL_FUNGIBLE_TOKEN_ADDRESS, fuelAcct);

      return { contract: l2Bridge, proxy, implementation };
    } catch (e) {
      l2Bridge = null;
      debug(
        `The Fuel bridge contract could not be found at the provided address ${FUEL_FUNGIBLE_TOKEN_ADDRESS}.`
      );
    }
  }

  debug(`Creating Fuel bridge contract to test with...`);
  const implConfigurables: any = {
    BRIDGED_TOKEN_GATEWAY: eth_address_to_b256(tokenGateway),
  };

  implementation = await BridgeFungibleTokenFactory.deploy(fuelAcct, {
    configurableConstants: implConfigurables,
  })
    .then((tx) => tx.waitForResult())
    .then(({ contract }) => contract);

  debug('Creating proxy contract');
  const proxyConfigurables: any = {
    INITIAL_TARGET: { bits: implementation.id.toB256() },
    INITIAL_OWNER: {
      Initialized: {
        Address: { bits: env.fuel.deployer.address.toHexString() },
      },
    },
  };

  proxy = await ProxyFactory.deploy(fuelAcct, {
    configurableConstants: proxyConfigurables,
  })
    .then((tx) => tx.waitForResult())
    .then(({ contract }) => contract);

  // create contract instance
  l2Bridge = new BridgeFungibleToken(proxy.id.toB256(), fuelAcct);

  const [fuelSigner] = env.fuel.signers;
  l2Bridge.account = fuelSigner;

  debug('Finished setting up bridge');

  l2Bridge.account = fuelAcct;

  return { contract: l2Bridge, proxy, implementation };
}
