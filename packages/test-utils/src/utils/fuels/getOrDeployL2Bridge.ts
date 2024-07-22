import {
  fungibleTokenBinary,
  fungibleTokenABI,
  bridgeProxyBinary,
  bridgeProxyABI,
  bridgeProxyStorageSlots,
} from '@fuel-bridge/fungible-token';
import type { AddressLike } from 'ethers';
import type { TxParams } from 'fuels';
import { ContractFactory, Contract } from 'fuels';

import { debug } from '../logs';
import { eth_address_to_b256 } from '../parsers';
import type { TestEnvironment } from '../setup';

const { FUEL_FUNGIBLE_TOKEN_ADDRESS } = process.env;

export async function getOrDeployL2Bridge(
  env: TestEnvironment,
  ethTokenGateway: AddressLike,
  fuelTxParams: TxParams,
  DECIMALS?: number
) {
  if (typeof ethTokenGateway !== 'string') {
    ethTokenGateway =
      'then' in ethTokenGateway
        ? await ethTokenGateway
        : await ethTokenGateway.getAddress();
  }

  const tokenGateway = ethTokenGateway.replace('0x', '');
  const fuelAcct = env.fuel.signers[1];

  let l2Bridge: Contract;
  let proxy: Contract;
  let implementation: Contract;

  if (FUEL_FUNGIBLE_TOKEN_ADDRESS) {
    try {
      proxy = new Contract(
        FUEL_FUNGIBLE_TOKEN_ADDRESS,
        bridgeProxyABI as any,
        fuelAcct
      );

      const { value: implementationContractId } = await proxy.functions
        ._proxy_target()
        .dryRun();

      implementation = new Contract(
        implementationContractId.bits,
        fungibleTokenABI as any,
        fuelAcct
      );

      l2Bridge = new Contract(
        FUEL_FUNGIBLE_TOKEN_ADDRESS,
        fungibleTokenABI as any,
        fuelAcct
      );
    } catch (e) {
      l2Bridge = null;
      debug(
        `The Fuel bridge contract could not be found at the provided address ${FUEL_FUNGIBLE_TOKEN_ADDRESS}.`
      );
    }
  }
  if (!l2Bridge) {
    debug(`Creating Fuel bridge contract to test with...`);
    const bytecodeHex = fungibleTokenBinary;
    const implFactory = new ContractFactory(
      bytecodeHex,
      fungibleTokenABI as any,
      env.fuel.deployer
    );

    const implConfigurables: any = {
      BRIDGED_TOKEN_GATEWAY: eth_address_to_b256(tokenGateway),
    };

    if (DECIMALS !== undefined) implConfigurables['DECIMALS'] = DECIMALS;

    // Set the token gateway and token address in the contract
    implFactory.setConfigurableConstants(implConfigurables);

    const {
      contractId: implContractId,
      transactionRequest: implCreateTxRequest,
    } = implFactory.createTransactionRequest({
      ...fuelTxParams,
      storageSlots: [],
    });

    {
      const { requiredQuantities } = await fuelAcct.provider.getTransactionCost(
        implCreateTxRequest
      );

      await fuelAcct.fund(implCreateTxRequest, {
        requiredQuantities,
        estimatedPredicates: [],
        addedSignatures: 0,
      });

      // send transaction

      debug('Deploying implementation contract...');
      const response = await fuelAcct.sendTransaction(implCreateTxRequest);
      await response.wait();
      debug(`Implementation contract deployed at ${implContractId}.`);
    }

    debug('Creating proxy contract');
    const proxyFactory = new ContractFactory(
      bridgeProxyBinary,
      bridgeProxyABI,
      env.fuel.deployer
    );

    const proxyConfigurables: any = {
      INITIAL_TARGET: { bits: implContractId },
      INITIAL_OWNER: {
        Initialized: {
          Address: { bits: env.fuel.deployer.address.toHexString() },
        },
      },
    };

    proxyFactory.setConfigurableConstants(proxyConfigurables);

    const {
      contractId: proxyContractId,
      transactionRequest: proxyCreateTxRequest,
    } = proxyFactory.createTransactionRequest({
      ...fuelTxParams,
      storageSlots: bridgeProxyStorageSlots,
    });

    {
      const { requiredQuantities } = await fuelAcct.provider.getTransactionCost(
        proxyCreateTxRequest
      );

      await fuelAcct.fund(proxyCreateTxRequest, {
        requiredQuantities,
        estimatedPredicates: [],
        addedSignatures: 0,
      });

      // send deployment transaction
      debug('Deploying proxy contract...');
      const response = await fuelAcct.sendTransaction(proxyCreateTxRequest);
      await response.wait();
      debug(`Proxy contract deployed at ${proxyContractId}.`);
    }

    // create contract instance
    l2Bridge = new Contract(
      proxyContractId,
      implFactory.interface,
      implFactory.account
    );

    proxy = new Contract(
      proxyContractId,
      proxyFactory.interface,
      proxyFactory.account
    );
    implementation = new Contract(
      implContractId,
      implFactory.interface,
      implFactory.account
    );

    const [fuelSigner] = env.fuel.signers;
    l2Bridge.account = fuelSigner;

    debug('Finished setting up bridge');
  }

  l2Bridge.account = fuelAcct;
  debug(
    `Testing with Fuel fungible token contract at ${l2Bridge.id.toHexString()}.`
  );

  return { contract: l2Bridge, proxy, implementation };
}
