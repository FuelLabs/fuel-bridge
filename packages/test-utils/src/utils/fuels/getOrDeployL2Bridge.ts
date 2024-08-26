import type {
  BridgeFungibleTokenAbi,
  ProxyAbi,
} from '@fuel-bridge/fungible-token';
import {
  fungibleTokenBinary,
  bridgeProxyBinary,
  BridgeFungibleTokenAbi__factory,
  ProxyAbi__factory,
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

  let l2Bridge: BridgeFungibleTokenAbi;
  let proxy: ProxyAbi;
  let implementation: BridgeFungibleTokenAbi;

  if (FUEL_FUNGIBLE_TOKEN_ADDRESS) {
    try {
      proxy = ProxyAbi__factory.connect(FUEL_FUNGIBLE_TOKEN_ADDRESS, fuelAcct);

      const { value: implementationContractId } = await proxy.functions
        ._proxy_target()
        .dryRun();

      implementation = BridgeFungibleTokenAbi__factory.connect(
        implementationContractId.bits,
        fuelAcct
      );

      l2Bridge = BridgeFungibleTokenAbi__factory.connect(
        FUEL_FUNGIBLE_TOKEN_ADDRESS,
        fuelAcct
      );

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

  implementation = await BridgeFungibleTokenAbi__factory.deployContract(
    fungibleTokenBinary,
    fuelAcct,
    { configurableConstants: implConfigurables }
  )
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

  proxy = await ProxyAbi__factory.deployContract(bridgeProxyBinary, fuelAcct, {
    configurableConstants: proxyConfigurables,
  })
    .then((tx) => tx.waitForResult())
    .then(({ contract }) => contract);

  // create contract instance
  l2Bridge = BridgeFungibleTokenAbi__factory.connect(
    proxy.id.toB256(),
    fuelAcct
  );

  const [fuelSigner] = env.fuel.signers;
  l2Bridge.account = fuelSigner;

  debug('Finished setting up bridge');

  l2Bridge.account = fuelAcct;

  return { contract: l2Bridge, proxy, implementation };
}
