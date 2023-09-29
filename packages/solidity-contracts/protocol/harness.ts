/// @dev The Fuel testing harness.
/// A set of useful helper methods for testing Fuel.
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import type { BigNumber as BN, Signer } from 'ethers';
import { ethers, upgrades } from 'hardhat';

import type {
  FuelMessagePortal,
  MockFuelMessagePortal,
  FuelChainState,
  FuelERC20Gateway,
  FuelERC721Gateway,
  Token,
  NFT,
} from '../typechain';

// All deployable contracts.
export interface DeployedContracts {
  fuelMessagePortal: FuelMessagePortal;
  fuelMessagePortalMock: MockFuelMessagePortal;
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
  signers: Array<SignerWithAddress>;
  addresses: Array<string>;
  initialTokenAmount: BN;
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
  return {
    FuelChainState: contracts.fuelChainState.address,
    FuelMessagePortal: contracts.fuelMessagePortal.address,
    FuelERC20Gateway: contracts.fuelERC20Gateway.address,
    FuelERC721Gateway: contracts.fuelERC721Gateway.address,
    FuelChainState_impl: await upgrades.erc1967.getImplementationAddress(
      contracts.fuelChainState.address
    ),
    FuelMessagePortal_impl: await upgrades.erc1967.getImplementationAddress(
      contracts.fuelMessagePortal.address
    ),
    FuelERC20Gateway_impl: await upgrades.erc1967.getImplementationAddress(
      contracts.fuelERC20Gateway.address
    ),
    FuelERC721Gateway_impl: await upgrades.erc1967.getImplementationAddress(
      contracts.fuelERC721Gateway.address
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
  const token: Token = (await tokenFactory.deploy()) as Token;
  await token.deployed();

  // Mint some dummy token for deposit testing
  const initialTokenAmount = ethers.utils.parseEther('1000000');
  for (let i = 0; i < signers.length; i += 1) {
    await token.mint(await signers[i].getAddress(), initialTokenAmount);
  }

  // Deploy an nft for gateway testing
  const nft: NFT = await ethers
    .getContractFactory('NFT', deployer)
    .then((factory) => factory.deploy())
    .then((contract) => contract.deployed() as Promise<NFT>);

  // Mint some dummy token for deposit testing
  for (let i = 0; i < signers.length; i += 1) {
    await nft.mint(await signers[i].getAddress(), i);
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
  const fuelChainState = (await upgrades.deployProxy(FuelChainState, [], {
    initializer: 'initialize',
  })) as FuelChainState;
  await fuelChainState.deployed();

  // Deploy message portal contract
  const FuelMessagePortal = await ethers.getContractFactory(
    'FuelMessagePortal',
    deployer
  );
  const fuelMessagePortal = (await upgrades.deployProxy(
    FuelMessagePortal,
    [fuelChainState.address],
    {
      initializer: 'initialize',
    }
  )) as FuelMessagePortal;
  await fuelMessagePortal.deployed();

  const fuelMessagePortalMock = await ethers
    .getContractFactory('MockFuelMessagePortal', deployer)
    .then((factory) => factory.deploy() as Promise<MockFuelMessagePortal>);

  // Deploy gateway contract for ERC20 bridging
  const FuelERC20Gateway = await ethers.getContractFactory(
    'FuelERC20Gateway',
    deployer
  );
  const fuelERC20Gateway = (await upgrades.deployProxy(
    FuelERC20Gateway,
    [fuelMessagePortalMock.address],
    {
      initializer: 'initialize',
    }
  )) as FuelERC20Gateway;
  await fuelERC20Gateway.deployed();

  // Deploy gateway contract for ERC721 bridging
  const FuelERC721Gateway = await ethers.getContractFactory(
    'FuelERC721Gateway',
    deployer
  );
  const fuelERC721Gateway = (await upgrades.deployProxy(
    FuelERC721Gateway,
    [fuelMessagePortal.address],
    {
      initializer: 'initialize',
    }
  )) as FuelERC721Gateway;
  await fuelERC721Gateway.deployed();

  // Return deployed contracts
  return {
    fuelChainState,
    fuelMessagePortal,
    fuelMessagePortalMock,
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
  });
  await upgrades.upgradeProxy(contracts.FuelChainState, FuelChainState);

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
