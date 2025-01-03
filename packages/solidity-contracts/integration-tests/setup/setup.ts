import type { Signer as EthSigner } from 'ethers';
import type { WalletUnlocked as FuelWallet } from 'fuels';
import { Wallet, Provider as FuelProvider, BN } from 'fuels';
import hre from 'hardhat';

import {
  FuelChainState__factory,
  FuelMessagePortalV3__factory as FuelMessagePortal__factory,
  FuelERC20GatewayV4__factory as FuelERC20Gateway__factory,
} from '../../typechain';
import type {
  FuelChainState,
  FuelMessagePortalV3 as FuelMessagePortal,
  FuelERC20GatewayV4 as FuelERC20Gateway,
} from '../../typechain';

export interface TestEnvironment {
  eth: {
    fuelChainState: FuelChainState;
    fuelMessagePortal: FuelMessagePortal;
    fuelERC20Gateway: FuelERC20Gateway;
    deployer: EthSigner;
    signers: EthSigner[];
  };
  fuel: {
    provider: FuelProvider;
    deployer: FuelWallet;
    signers: FuelWallet[];
  };
}

const ETHEREUM_ETH_DECIMALS = 18n;
const FUEL_ETH_DECIMALS = 9n;

const def_pk_fuel_deployer: string =
  '0xde97d8624a438121b86a1956544bd72ed68cd69f2c99555b08b1e8c51ffd511c';
const def_pk_fuel_signer1: string =
  '0xa349d39f614a3085b7f7f8cef63fd5189136924fc1238e6d25ccdaa43a901cd0';
const def_pk_fuel_signer2: string =
  '0x139f2cd8db62a9d64c3ed4cdc804f1fb53be98d750cd1432a308b34a42d8dcc7';

// Parse ETH value as a string
export function fuels_parseEther(ether: string): BN {
  let val = hre.ethers.parseEther(ether);
  val = val / 10n ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS);
  return new BN(hre.ethers.toBeHex(val));
}

// Format ETH value to a string
export function fuels_formatEther(ether: BN): string {
  let val = BigInt(ether.toHex());
  val = val * 10n ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS);
  return hre.ethers.formatEther(val);
}

export async function setupEnvironment(): Promise<TestEnvironment> {
  // Default config values
  const def_http_deployer: string = 'http://127.0.0.1:8080';
  const def_http_fuel: string = 'http://127.0.0.1:4000/v1/graphql';

  let deployerAddresses: any = null;
  try {
    deployerAddresses = await fetch(
      def_http_deployer + '/deployments.local.json'
    ).then((resp) => resp.json());
  } catch (e) {
    console.error(e);
    throw new Error(
      'Failed to connect to the deployer at (' +
        def_http_deployer +
        "). Are you sure it's running?"
    );
  }

  const signers = await hre.ethers.getSigners();

  const eth_fuelChainState: FuelChainState = FuelChainState__factory.connect(
    deployerAddresses.FuelChainState,
    signers[0]
  );
  const eth_fuelMessagePortal: FuelMessagePortal =
    FuelMessagePortal__factory.connect(
      deployerAddresses.FuelMessagePortal,
      signers[0]
    );
  const eth_fuelERC20Gateway: FuelERC20Gateway =
    FuelERC20Gateway__factory.connect(
      deployerAddresses.FuelERC20GatewayV4,
      signers[0]
    );

  // Create provider from http_fuel_client
  const fuel_provider = await FuelProvider.create(def_http_fuel);
  try {
    await fuel_provider.getBlockNumber();
  } catch (e) {
    throw new Error(
      'Failed to connect to the Fuel client at (' +
        def_http_fuel +
        "). Are you sure it's running?"
    );
  }

  const fuel_deployer = Wallet.fromPrivateKey(
    def_pk_fuel_deployer,
    fuel_provider
  );
  const fuel_deployerBalance = await fuel_deployer.getBalance();
  if (fuel_deployerBalance.lt(fuels_parseEther('5'))) {
    throw new Error(
      'Fuel deployer balance is very low (' +
        fuels_formatEther(fuel_deployerBalance) +
        'ETH)'
    );
  }
  const fuel_signer1 = Wallet.fromPrivateKey(
    def_pk_fuel_signer1,
    fuel_provider
  );
  const fuel_signer1Balance = await fuel_signer1.getBalance();
  if (fuel_signer1Balance.lt(fuels_parseEther('1'))) {
    const tx = await fuel_deployer.transfer(
      fuel_signer1.address,
      fuels_parseEther('1').toHex()
    );
    await tx.wait();
  }
  const fuel_signer2 = Wallet.fromPrivateKey(
    def_pk_fuel_signer2,
    fuel_provider
  );
  const fuel_signer2Balance = await fuel_signer2.getBalance();
  if (fuel_signer2Balance.lt(fuels_parseEther('1'))) {
    const tx = await fuel_deployer.transfer(
      fuel_signer2.address,
      fuels_parseEther('1').toHex()
    );
    await tx.wait();
  }

  return {
    eth: {
      fuelChainState: eth_fuelChainState,
      fuelMessagePortal: eth_fuelMessagePortal,
      fuelERC20Gateway: eth_fuelERC20Gateway,
      deployer: signers[0],
      signers: [signers[3], signers[4], signers[5]],
    },
    fuel: {
      provider: fuel_provider,
      deployer: fuel_deployer,
      signers: [fuel_signer1, fuel_signer2],
    },
  };
}
