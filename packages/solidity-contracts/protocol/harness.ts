/// @dev The Fuel testing harness.
/// A set of useful helper methods for testing Fuel.

import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { parseEther, type Signer } from 'ethers';
import { ethers, upgrades } from 'hardhat';

import {
  type FuelMessagePortal,
  type FuelChainState,
  type FuelERC20Gateway,
  type FuelERC721Gateway,
  type Token,
  type NFT,
  FuelChainState__factory,
  FuelMessagePortal__factory,
  FuelERC20GatewayV2__factory,
  FuelERC721Gateway__factory,
} from '../typechain';

// All deployable contracts.
export interface DeployedContracts {
  fuelMessagePortal: FuelMessagePortal;
  fuelChainState: FuelChainState;
  fuelERC20Gateway: FuelERC20Gateway;
  fuelERC721Gateway: FuelERC721Gateway;
}
export interface DeployedContractAddresses {
  FuelMessagePortal: string;
  FuelChainState: string;
  FuelERC20Gateway: string;
  FuelERC721Gateway: string;
  FuelMessagePortal_impl: string;
  FuelChainState_impl: string;
  FuelERC20Gateway_impl: string;
  FuelERC721Gateway_impl: string;
}

// The harness object.
export interface HarnessObject extends DeployedContracts {
  contractAddresses: DeployedContractAddresses;
  token: Token;
  nft: NFT;
  signer: string;
  deployer: Signer;
  signers: Array<HardhatEthersSigner>;
  addresses: Array<string>;
  initialTokenAmount: bigint;
}

// Gets a blank set of addresses for the deployed contracts.
export function getBlankAddresses(): DeployedContractAddresses {
  return {
    FuelChainState: '',
    FuelMessagePortal: '',
    FuelERC20Gateway: '',
    FuelERC721Gateway: '',
    FuelChainState_impl: '',
    FuelMessagePortal_impl: '',
    FuelERC20Gateway_impl: '',
    FuelERC721Gateway_impl: '',
  };
}

// Gets the addresses of the deployed contracts.
export async function getContractAddresses(
  contracts: DeployedContracts
): Promise<DeployedContractAddresses> {
  const fuelChainStateAddress = await contracts.fuelChainState.getAddress();
  const fuelMessagePortalAddress =
    await contracts.fuelMessagePortal.getAddress();
  const fuelERC20GatewayAddress = await contracts.fuelERC20Gateway.getAddress();
  const fuelERC721GatewayAddress =
    await contracts.fuelERC721Gateway.getAddress();
  return {
    FuelChainState: fuelChainStateAddress,
    FuelMessagePortal: fuelMessagePortalAddress,
    FuelERC20Gateway: fuelERC20GatewayAddress,
    FuelERC721Gateway: fuelERC721GatewayAddress,
    FuelChainState_impl: await upgrades.erc1967.getImplementationAddress(
      fuelChainStateAddress
    ),
    FuelMessagePortal_impl: await upgrades.erc1967.getImplementationAddress(
      fuelMessagePortalAddress
    ),
    FuelERC20Gateway_impl: await upgrades.erc1967.getImplementationAddress(
      fuelERC20GatewayAddress
    ),
    FuelERC721Gateway_impl: await upgrades.erc1967.getImplementationAddress(
      fuelERC721GatewayAddress
    ),
  };
}

// The setup method for Fuel.
export async function setupFuel(): Promise<HarnessObject> {
  // Get signers
  // Use a different deployer to ensure all contracts can be deployed
  // and upagrade by an different account.
  const signers = (await ethers.getSigners()).slice(1);
  const deployer = signers[0];
  const signer = signers[0].address;

  // Deploy Fuel contracts
  const contracts = await deployFuel(deployer);

  // Deploy a token for gateway testing
  const tokenFactory = await ethers.getContractFactory('Token', deployer);

  const token: Token = (await tokenFactory
    .deploy()
    .then((tx) => tx.waitForDeployment())) as Token;

  // Mint some dummy token for deposit testing
  const initialTokenAmount = parseEther('1000000');
  for (let i = 0; i < signers.length; i += 1) {
    await token.mint(signers[i], initialTokenAmount);
  }

  // Deploy an nft for gateway testing
  const nft: NFT = await ethers
    .getContractFactory('NFT', deployer)
    .then((factory) => factory.deploy())
    .then((contract) => contract.waitForDeployment() as Promise<NFT>);

  // Mint some dummy token for deposit testing
  for (let i = 0; i < signers.length; i += 1) {
    await nft.mint(signers[i], i);
  }

  // Return the Fuel harness object
  return {
    contractAddresses: await getContractAddresses(contracts),
    ...contracts,
    token,
    nft,
    deployer,
    signer,
    signers,
    addresses: signers.map((v) => v.address),
    initialTokenAmount,
  };
}

// The full contract deployment for Fuel.
export async function deployFuel(
  deployer?: Signer
): Promise<DeployedContracts> {
  // Deploy fuel chain state contract
  const FuelChainState = await ethers.getContractFactory(
    'FuelChainState',
    deployer
  );

  const fuelChainState = await upgrades
    .deployProxy(FuelChainState, [], {
      initializer: 'initialize',
      constructorArgs: [10800, 10800, 10800],
    })
    .then((tx) => tx.waitForDeployment())
    .then((tx) => FuelChainState__factory.connect(tx as any, tx.runner));

  // Deploy message portal contract
  const FuelMessagePortal = await ethers.getContractFactory(
    'FuelMessagePortal',
    deployer
  );

  const fuelMessagePortal = await upgrades
    .deployProxy(FuelMessagePortal, [await fuelChainState.getAddress()], {
      initializer: 'initialize',
    })
    .then((tx) => tx.waitForDeployment())
    .then((tx) => FuelMessagePortal__factory.connect(tx as any, tx.runner));
  const fuelMessagePortalAddress = await fuelMessagePortal.getAddress();

  // Deploy gateway contract for ERC20 bridging
  const FuelERC20Gateway = await ethers.getContractFactory(
    'FuelERC20GatewayV2',
    deployer
  );
  const fuelERC20Gateway = await upgrades
    .deployProxy(FuelERC20Gateway, [fuelMessagePortalAddress], {
      initializer: 'initialize',
    })
    .then((tx) => tx.waitForDeployment())
    .then((tx) => FuelERC20GatewayV2__factory.connect(tx as any, tx.runner));

  // Deploy gateway contract for ERC721 bridging
  const FuelERC721Gateway = await ethers.getContractFactory(
    'FuelERC721GatewayV2',
    deployer
  );
  const fuelERC721Gateway = await upgrades
    .deployProxy(FuelERC721Gateway, [fuelMessagePortalAddress], {
      initializer: 'initialize',
    })
    .then((tx) => tx.waitForDeployment())
    .then((tx) => FuelERC721Gateway__factory.connect(tx as any, tx.runner));

  // Return deployed contracts
  return {
    fuelChainState,
    fuelMessagePortal,
    fuelERC20Gateway,
    fuelERC721Gateway,
  };
}

// The full contract deployment for Fuel.
export async function upgradeFuel(
  contracts: DeployedContractAddresses,
  signer?: Signer
): Promise<DeployedContractAddresses> {
  // Upgrade fuel chain state contract
  const FuelChainState = await ethers.getContractFactory(
    'FuelChainState',
    signer
  );
  await upgrades.forceImport(contracts.FuelChainState, FuelChainState, {
    kind: 'uups',
    constructorArgs: [10800, 10800, 10800],
  } as any);
  await upgrades.upgradeProxy(contracts.FuelChainState, FuelChainState, {
    constructorArgs: [10800, 10800, 10800],
  });

  // Upgrade message portal contract
  const FuelMessagePortal = await ethers.getContractFactory(
    'FuelMessagePortal',
    signer
  );
  await upgrades.forceImport(contracts.FuelMessagePortal, FuelMessagePortal, {
    kind: 'uups',
  });
  await upgrades.upgradeProxy(contracts.FuelMessagePortal, FuelMessagePortal);

  // Upgrade gateway contract for ERC20 bridging
  const FuelERC20Gateway = await ethers.getContractFactory(
    'FuelERC20Gateway',
    signer
  );
  await upgrades.forceImport(contracts.FuelERC20Gateway, FuelERC20Gateway, {
    kind: 'uups',
  });
  await upgrades.upgradeProxy(contracts.FuelERC20Gateway, FuelERC20Gateway);

  // Upgrade gateway contract for ERC20 bridging
  const FuelERC721Gateway = await ethers.getContractFactory(
    'FuelERC721Gateway',
    signer
  );
  await upgrades.forceImport(contracts.FuelERC721Gateway, FuelERC721Gateway, {
    kind: 'uups',
  });
  await upgrades.upgradeProxy(contracts.FuelERC721Gateway, FuelERC721Gateway);

  // Return deployed contracts
  contracts.FuelChainState_impl =
    await upgrades.erc1967.getImplementationAddress(contracts.FuelChainState);
  contracts.FuelMessagePortal_impl =
    await upgrades.erc1967.getImplementationAddress(
      contracts.FuelMessagePortal
    );
  contracts.FuelERC20Gateway_impl =
    await upgrades.erc1967.getImplementationAddress(contracts.FuelERC20Gateway);
  return contracts;
}
