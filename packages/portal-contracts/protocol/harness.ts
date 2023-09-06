/// @dev The Fuel testing harness.
/// A set of useful helper methods for testing Fuel.
import { ethers, upgrades } from 'hardhat';
import { BigNumber as BN, Signer } from 'ethers';
import { FuelChainState } from '../typechain/FuelChainState.d';
import { FuelMessagePortal } from '../typechain/FuelMessagePortal.d';
import { FuelERC20Gateway } from '../typechain/FuelERC20Gateway.d';
import { Token } from '../typechain/Token.d';

// All deployable contracts.
export type FuelDeployedContracts = {
  fuelMessagePortal: FuelMessagePortal;
  fuelChainState: FuelChainState;
  fuelERC20Gateway: FuelERC20Gateway;
}
export type FuelDeployedContractAddresses = {
  FuelMessagePortal: string;
  FuelChainState: string;
  FuelERC20Gateway: string;
  FuelMessagePortal_impl: string;
  FuelChainState_impl: string;
  FuelERC20Gateway_impl: string;
}
export type DeployedContracts = {
  erc20?: Token;
} & FuelDeployedContracts;
export type DeployedContractAddresses = {
  ERC20?: string;
} & FuelDeployedContractAddresses;

// The harness object.
export interface HarnessObject {
  contractAddresses: FuelDeployedContractAddresses;
  fuelMessagePortal: FuelMessagePortal;
  fuelChainState: FuelChainState;
  fuelERC20Gateway: FuelERC20Gateway;
  token: Token;
  signer: string;
  deployer: Signer;
  signers: Array<Signer>;
  addresses: Array<string>;
  initialTokenAmount: BN;
}

// Gets a blank set of addresses for the deployed contracts.
export function getBlankAddresses(): DeployedContractAddresses {
  return {
    FuelChainState: '',
    FuelMessagePortal: '',
    FuelERC20Gateway: '',
    ERC20: '',
    FuelChainState_impl: '',
    FuelMessagePortal_impl: '',
    FuelERC20Gateway_impl: '',
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
    ERC20: contracts.erc20?.address,
    FuelChainState_impl: await upgrades.erc1967.getImplementationAddress(
      contracts.fuelChainState.address
    ),
    FuelMessagePortal_impl: await upgrades.erc1967.getImplementationAddress(
      contracts.fuelMessagePortal.address
    ),
    FuelERC20Gateway_impl: await upgrades.erc1967.getImplementationAddress(
      contracts.fuelERC20Gateway.address
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

  // Return the Fuel harness object
  return {
    contractAddresses: await getContractAddresses({ ...contracts, erc20: token }),
    fuelChainState: contracts.fuelChainState,
    fuelMessagePortal: contracts.fuelMessagePortal,
    fuelERC20Gateway: contracts.fuelERC20Gateway,
    token,
    deployer,
    signer,
    signers,
    addresses: signers.map((v) => v.address),
    initialTokenAmount,
  };
}

// The full contract deployment for Fuel.
export async function deployFuel(deployer?: Signer): Promise<FuelDeployedContracts> {
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

  // Deploy gateway contract for ERC20 bridging
  const FuelERC20Gateway = await ethers.getContractFactory(
    'FuelERC20Gateway',
    deployer
  );
  const fuelERC20Gateway = (await upgrades.deployProxy(
    FuelERC20Gateway,
    [fuelMessagePortal.address],
    {
      initializer: 'initialize',
    }
  )) as FuelERC20Gateway;
  await fuelERC20Gateway.deployed();

  // Return deployed contracts
  return {
    fuelChainState,
    fuelMessagePortal,
    fuelERC20Gateway,
  };
}

// The full contract deployment for Fuel.
export async function upgradeFuel(
  contracts: FuelDeployedContractAddresses,
  signer?: Signer
): Promise<FuelDeployedContractAddresses> {
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
