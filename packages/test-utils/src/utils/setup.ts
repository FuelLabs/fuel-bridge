/// @dev The Fuel testing setup.
/// A set of useful helper methods for setting up the integration test environment.
import type {
  FuelChainState,
  FuelMessagePortal,
  FuelERC20GatewayV4 as FuelERC20Gateway,
  FuelERC721Gateway,
} from '@fuel-bridge/solidity-contracts/typechain';
import {
  FuelChainState__factory,
  FuelMessagePortal__factory,
  FuelERC20GatewayV4__factory as FuelERC20Gateway__factory,
  FuelERC721Gateway__factory,
} from '@fuel-bridge/solidity-contracts/typechain';
import * as dotenv from 'dotenv';
import type { Signer as EthSigner, Provider as EthProvider } from 'ethers';
import {
  JsonRpcProvider,
  ethers,
  formatEther,
  parseEther,
  NonceManager,
} from 'ethers';
import type { WalletUnlocked as FuelWallet } from 'fuels';
import { Wallet, Provider as FuelProvider } from 'fuels';

import { fuels_parseEther, fuels_formatEther } from './parsers';

dotenv.config();

// Default config values
const def_http_eth: string = 'http://127.0.0.1:8545';
const def_http_deployer: string = 'http://127.0.0.1:8080';
const def_http_fuel: string = 'http://127.0.0.1:4000/v1/graphql';

// Default private keys of the developer mnemonic
const eth_private_keys: string[] = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Deployer private key
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Committer private key
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // Signer 1 private key
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // Signer 2 private key
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

const def_pk_fuel_deployer: string =
  '0xba9e8401405cd4327119548bccf0cd8b195c3fb716c848d9571c60bb230c6978';
const def_pk_fuel_signer1: string =
  '0xa349d39f614a3085b7f7f8cef63fd5189136924fc1238e6d25ccdaa43a901cd0';
const def_pk_fuel_signer2: string =
  '0x139f2cd8db62a9d64c3ed4cdc804f1fb53be98d750cd1432a308b34a42d8dcc7';

// Setup options
export interface SetupOptions {
  http_ethereum_client?: string;
  http_deployer?: string;
  http_fuel_client?: string;
  pk_eth_deployer?: string;
  pk_eth_signer1?: string;
  pk_eth_signer2?: string;
  pk_fuel_deployer?: string;
  pk_fuel_signer1?: string;
  pk_fuel_signer2?: string;
  skip_deployer_balance?: boolean;
}

// The test environment
export interface TestEnvironment {
  eth: {
    provider: EthProvider;
    jsonRPC: string;
    fuelChainState: FuelChainState;
    fuelMessagePortal: FuelMessagePortal;
    fuelERC20Gateway: FuelERC20Gateway;
    fuelERC721Gateway: FuelERC721Gateway;
    deployer: EthSigner;
    signers: EthSigner[];
  };
  fuel: {
    provider: FuelProvider;
    deployer: FuelWallet;
    signers: FuelWallet[];
  };
}

// The setup method for Fuel
export async function setupEnvironment(
  opts: SetupOptions
): Promise<TestEnvironment> {
  const http_ethereum_client: string =
    opts.http_ethereum_client ||
    process.env.HTTP_ETHEREUM_CLIENT ||
    def_http_eth;
  const http_deployer: string =
    opts.http_deployer || process.env.HTTP_DEPLOYER || def_http_deployer;
  const http_fuel_client: string =
    opts.http_fuel_client || process.env.HTTP_FUEL_CLIENT || def_http_fuel;
  const pk_eth_deployer: string =
    opts.pk_eth_deployer || process.env.PK_ETH_DEPLOYER || def_pk_eth_deployer;
  const pk_eth_signer1: string =
    opts.pk_eth_signer1 || process.env.PK_ETH_SIGNER1 || def_pk_eth_signer1;
  const pk_eth_signer2: string =
    opts.pk_eth_signer2 || process.env.PK_ETH_SIGNER2 || def_pk_eth_signer2;
  const pk_fuel_deployer: string =
    opts.pk_fuel_deployer ||
    process.env.PK_FUEL_DEPLOYER ||
    def_pk_fuel_deployer;
  const pk_fuel_signer1: string =
    opts.pk_fuel_signer1 || process.env.PK_FUEL_SIGNER1 || def_pk_fuel_signer1;
  const pk_fuel_signer2: string =
    opts.pk_fuel_signer2 || process.env.PK_FUEL_SIGNER2 || def_pk_fuel_signer2;
  const fuel_chain_consensus_addr: string =
    process.env.FUEL_CHAIN_CONSENSUS_ADDRESS || '';
  const fuel_message_portal_addr: string =
    process.env.FUEL_MESSAGE_PORTAL_ADDRESS || '';
  const fuel_erc20_gateway_addr: string =
    process.env.FUEL_ERC20_GATEWAY_ADDRESS || '';

  const fuel_erc721_gateway_addr: string =
    process.env.FUEL_ERC20_GATEWAY_ADDRESS || '';
  const skip_deployer_balance = !opts.skip_deployer_balance;

  // Create provider from http_fuel_client
  const fuel_provider = await FuelProvider.create(http_fuel_client);
  try {
    await fuel_provider.getBlockNumber();
  } catch (e) {
    throw new Error(
      'Failed to connect to the Fuel client at (' +
        http_fuel_client +
        "). Are you sure it's running?"
    );
  }
  const fuel_deployer = Wallet.fromPrivateKey(pk_fuel_deployer, fuel_provider);
  const fuel_deployerBalance = await fuel_deployer.getBalance();
  if (fuel_deployerBalance.lt(fuels_parseEther('5')) && skip_deployer_balance) {
    throw new Error(
      'Fuel deployer balance is very low (' +
        fuels_formatEther(fuel_deployerBalance) +
        'ETH)'
    );
  }
  const fuel_signer1 = Wallet.fromPrivateKey(pk_fuel_signer1, fuel_provider);
  const fuel_signer1Balance = await fuel_signer1.getBalance();
  if (fuel_signer1Balance.lt(fuels_parseEther('1')) && skip_deployer_balance) {
    const tx = await fuel_deployer.transfer(
      fuel_signer1.address,
      fuels_parseEther('1').toHex()
    );
    await tx.wait();
  }
  const fuel_signer2 = Wallet.fromPrivateKey(pk_fuel_signer2, fuel_provider);
  const fuel_signer2Balance = await fuel_signer2.getBalance();
  if (fuel_signer2Balance.lt(fuels_parseEther('1')) && skip_deployer_balance) {
    const tx = await fuel_deployer.transfer(
      fuel_signer2.address,
      fuels_parseEther('1').toHex()
    );
    await tx.wait();
  }

  // Create provider and signers from http_ethereum_client
  const eth_provider = new JsonRpcProvider(http_ethereum_client);

  try {
    await eth_provider.getBlockNumber();
  } catch (e) {
    throw new Error(
      'Failed to connect to the Ethereum client at (' +
        http_ethereum_client +
        "). Are you sure it's running?"
    );
  }
  const eth_deployer = new NonceManager(
    new ethers.Wallet(pk_eth_deployer, eth_provider)
  );
  const eth_deployerBalance = await eth_provider.getBalance(eth_deployer);
  if (eth_deployerBalance < parseEther('5') && skip_deployer_balance) {
    throw new Error(
      'Ethereum deployer balance is very low (' +
        formatEther(eth_deployerBalance) +
        'ETH)'
    );
  }
  const eth_signer1 = new NonceManager(
    new ethers.Wallet(pk_eth_signer1, eth_provider)
  );
  const eth_signer1Balance = await eth_provider.getBalance(eth_signer1);
  if (eth_signer1Balance < parseEther('1') && skip_deployer_balance) {
    const tx = await eth_deployer.sendTransaction({
      to: eth_signer1,
      value: parseEther('1'),
    });
    await tx.wait();
  }
  const eth_signer2 = new NonceManager(
    new ethers.Wallet(pk_eth_signer2, eth_provider)
  );
  const eth_signer2Balance = await eth_provider.getBalance(eth_signer2);
  if (eth_signer2Balance < parseEther('1') && skip_deployer_balance) {
    const tx = await eth_deployer.sendTransaction({
      to: eth_signer2,
      value: parseEther('1'),
    });
    await tx.wait();
  }

  // Get contract addresses
  let eth_fuelChainStateAddress: string = fuel_chain_consensus_addr;
  let eth_fuelMessagePortalAddress: string = fuel_message_portal_addr;
  let eth_fuelERC20GatewayAddress: string = fuel_erc20_gateway_addr;
  let eth_fuelERC721GatewayAddress: string = fuel_erc721_gateway_addr;

  if (
    !eth_fuelChainStateAddress ||
    !eth_fuelMessagePortalAddress ||
    !eth_fuelERC20GatewayAddress ||
    !eth_fuelERC721GatewayAddress
  ) {
    let deployerAddresses: any = null;
    try {
      deployerAddresses = await fetch(
        http_deployer + '/deployments.local.json'
      ).then((resp) => resp.json());
    } catch (e) {
      console.error(e);
      throw new Error(
        'Failed to connect to the deployer at (' +
          http_deployer +
          "). Are you sure it's running?"
      );
    }
    if (!eth_fuelChainStateAddress) {
      if (!deployerAddresses.FuelChainState) {
        throw new Error('Failed to get FuelChainState address from deployer');
      }
      eth_fuelChainStateAddress = deployerAddresses.FuelChainState;
    }
    if (!eth_fuelMessagePortalAddress) {
      if (!deployerAddresses.FuelMessagePortal) {
        throw new Error(
          'Failed to get FuelMessagePortal address from deployer'
        );
      }
      eth_fuelMessagePortalAddress = deployerAddresses.FuelMessagePortal;
    }
    if (!eth_fuelERC20GatewayAddress) {
      if (!deployerAddresses.FuelERC20Gateway) {
        throw new Error('Failed to get FuelERC20Gateway address from deployer');
      }
      eth_fuelERC20GatewayAddress = deployerAddresses.FuelERC20Gateway;
    }

    if (!eth_fuelERC721GatewayAddress) {
      if (!deployerAddresses.FuelERC721Gateway) {
        throw new Error(
          'Failed to get FuelERC721Gateway address from deployer'
        );
      }
      eth_fuelERC721GatewayAddress = deployerAddresses.FuelERC721Gateway;
    }
  }

  // Connect existing contracts

  const eth_fuelChainState: FuelChainState = FuelChainState__factory.connect(
    eth_fuelChainStateAddress,
    eth_deployer
  );
  const eth_fuelMessagePortal: FuelMessagePortal =
    FuelMessagePortal__factory.connect(
      eth_fuelMessagePortalAddress,
      eth_deployer
    );
  const eth_fuelERC20Gateway: FuelERC20Gateway =
    FuelERC20Gateway__factory.connect(
      eth_fuelERC20GatewayAddress,
      eth_deployer
    );

  const eth_fuelERC721Gateway: FuelERC721Gateway =
    FuelERC721Gateway__factory.connect(
      eth_fuelERC721GatewayAddress,
      eth_deployer
    );

  // Return the Fuel harness object
  return {
    eth: {
      provider: eth_provider,
      jsonRPC: http_ethereum_client,
      fuelChainState: eth_fuelChainState,
      fuelMessagePortal: eth_fuelMessagePortal,
      fuelERC20Gateway: eth_fuelERC20Gateway,
      fuelERC721Gateway: eth_fuelERC721Gateway,
      deployer: eth_deployer,
      signers: [eth_signer1, eth_signer2],
    },
    fuel: {
      provider: fuel_provider,
      deployer: fuel_deployer,
      signers: [fuel_signer1, fuel_signer2],
    },
  };
}
