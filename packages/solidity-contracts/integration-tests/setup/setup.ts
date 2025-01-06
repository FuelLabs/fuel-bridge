import type { Signer as EthSigner } from 'ethers';
import {
  JsonRpcProvider,
  parseEther,
  formatEther,
  ethers,
  NonceManager,
} from 'ethers';
import type { WalletUnlocked as FuelWallet } from 'fuels';
import { Wallet, Provider as FuelProvider, BN } from 'fuels';

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
    provider: JsonRpcProvider;
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
  let val = ethers.parseEther(ether);
  val = val / 10n ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS);
  return new BN(ethers.toBeHex(val));
}

// Format ETH value to a string
export function fuels_formatEther(ether: BN): string {
  let val = BigInt(ether.toHex());
  val = val * 10n ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS);
  return ethers.formatEther(val);
}

export async function setupEnvironment(): Promise<TestEnvironment> {
  // Default config values
  const def_http_eth: string = 'http://127.0.0.1:8545';
  const def_http_deployer: string = 'http://127.0.0.1:8080';
  const def_http_fuel: string = 'http://127.0.0.1:4000/v1/graphql';

  // Default private keys of the developer mnemonic
  const eth_private_keys: string[] = [
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
    '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
    '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
    '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
    '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
    '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
  ];

  const def_pk_eth_deployer: string = eth_private_keys[0];
  const def_pk_eth_signer1: string = eth_private_keys[3];
  const def_pk_eth_signer2: string = eth_private_keys[4];
  const def_pk_eth_signer3: string = eth_private_keys[5];

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

  // Create provider and signers from http_ethereum_client
  const eth_provider = new JsonRpcProvider(def_http_eth);

  const eth_deployer = new NonceManager(
    new ethers.Wallet(def_pk_eth_deployer, eth_provider)
  );
  const eth_deployerBalance = await eth_provider.getBalance(eth_deployer);
  if (eth_deployerBalance < parseEther('5')) {
    throw new Error(
      'Ethereum deployer balance is very low (' +
        formatEther(eth_deployerBalance) +
        'ETH)'
    );
  }
  const eth_signer1 = new NonceManager(
    new ethers.Wallet(def_pk_eth_signer1, eth_provider)
  );
  const eth_signer1Balance = await eth_provider.getBalance(eth_signer1);
  if (eth_signer1Balance < parseEther('1')) {
    const tx = await eth_deployer.sendTransaction({
      to: eth_signer1,
      value: parseEther('1'),
    });
    await tx.wait();
  }
  const eth_signer2 = new NonceManager(
    new ethers.Wallet(def_pk_eth_signer2, eth_provider)
  );
  const eth_signer2Balance = await eth_provider.getBalance(eth_signer2);
  if (eth_signer2Balance < parseEther('1')) {
    const tx = await eth_deployer.sendTransaction({
      to: eth_signer2,
      value: parseEther('1'),
    });
    await tx.wait();
  }

  const eth_signer3 = new NonceManager(
    new ethers.Wallet(def_pk_eth_signer3, eth_provider)
  );
  const eth_signer3Balance = await eth_provider.getBalance(eth_signer3);
  if (eth_signer3Balance < parseEther('1')) {
    const tx = await eth_deployer.sendTransaction({
      to: eth_signer3,
      value: parseEther('1'),
    });
    await tx.wait();
  }

  const eth_fuelChainState: FuelChainState = FuelChainState__factory.connect(
    deployerAddresses.FuelChainState,
    eth_deployer
  );
  const eth_fuelMessagePortal: FuelMessagePortal =
    FuelMessagePortal__factory.connect(
      deployerAddresses.FuelMessagePortal,
      eth_deployer
    );
  const eth_fuelERC20Gateway: FuelERC20Gateway =
    FuelERC20Gateway__factory.connect(
      deployerAddresses.FuelERC20GatewayV4,
      eth_deployer
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
      provider: eth_provider,
      fuelChainState: eth_fuelChainState,
      fuelMessagePortal: eth_fuelMessagePortal,
      fuelERC20Gateway: eth_fuelERC20Gateway,
      deployer: eth_deployer,
      signers: [eth_signer1, eth_signer2, eth_signer3],
    },
    fuel: {
      provider: fuel_provider,
      deployer: fuel_deployer,
      signers: [fuel_signer1, fuel_signer2],
    },
  };
}
