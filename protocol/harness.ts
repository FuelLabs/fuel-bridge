/// @dev The Fuel testing harness.
/// A set of useful helper methods for testing Fuel.
import { ethers, upgrades } from 'hardhat';
import { BigNumber as BN, Signer } from 'ethers';
import { FuelChainConsensus } from '../typechain/FuelChainConsensus.d';
import { FuelMessagePortal } from '../typechain/FuelMessagePortal.d';
import { FuelERC20Gateway } from '../typechain/FuelERC20Gateway.d';
import { Token } from '../typechain/Token.d';
import { computeAddress, SigningKey } from 'ethers/lib/utils';

// Well known private key for testing.
export const DEFAULT_POA_KEY = '0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3';

// All deployable contracts.
export interface DeployedContracts {
    fuelMessagePortal: FuelMessagePortal;
    fuelChainConsensus: FuelChainConsensus;
    fuelERC20Gateway: FuelERC20Gateway;
}
export interface DeployedContractAddresses {
    FuelMessagePortal: string;
    FuelChainConsensus: string;
    FuelERC20Gateway: string;
    FuelMessagePortal_impl: string;
    FuelChainConsensus_impl: string;
    FuelERC20Gateway_impl: string;
}

// The harness object.
export interface HarnessObject {
    contractAddresses: DeployedContractAddresses;
    fuelMessagePortal: FuelMessagePortal;
    fuelChainConsensus: FuelChainConsensus;
    fuelERC20Gateway: FuelERC20Gateway;
    token: Token;
    poaSigner: SigningKey;
    poaSignerAddress: string;
    signer: string;
    signers: Array<Signer>;
    addresses: Array<string>;
    initialTokenAmount: BN;
}

// Gets a blank set of addresses for the deployed contracts.
export function getBlankAddresses(): DeployedContractAddresses {
    return {
        FuelChainConsensus: '',
        FuelMessagePortal: '',
        FuelERC20Gateway: '',
        FuelChainConsensus_impl: '',
        FuelMessagePortal_impl: '',
        FuelERC20Gateway_impl: '',
    };
}

// Gets the addresses of the deployed contracts.
export async function getContractAddresses(contracts: DeployedContracts): Promise<DeployedContractAddresses> {
    return {
        FuelChainConsensus: contracts.fuelChainConsensus.address,
        FuelMessagePortal: contracts.fuelMessagePortal.address,
        FuelERC20Gateway: contracts.fuelERC20Gateway.address,
        FuelChainConsensus_impl: await upgrades.erc1967.getImplementationAddress(contracts.fuelChainConsensus.address),
        FuelMessagePortal_impl: await upgrades.erc1967.getImplementationAddress(contracts.fuelMessagePortal.address),
        FuelERC20Gateway_impl: await upgrades.erc1967.getImplementationAddress(contracts.fuelERC20Gateway.address),
    };
}

// The setup method for Fuel.
export async function setupFuel(): Promise<HarnessObject> {
    // Create test POA signer
    const poaSigner = new SigningKey(DEFAULT_POA_KEY);
    const poaSignerAddress = computeAddress(poaSigner.privateKey);

    // Get signers
    const signer = (await ethers.getSigners())[0].address;
    const signers = await ethers.getSigners();

    // Deploy Fuel contracts
    const contracts = await deployFuel(poaSignerAddress);

    // Deploy a token for gateway testing
    const tokenFactory = await ethers.getContractFactory('Token');
    const token: Token = (await tokenFactory.deploy()) as Token;
    await token.deployed();

    // Mint some dummy token for deposit testing
    const initialTokenAmount = ethers.utils.parseEther('1000000');
    for (let i = 0; i < signers.length; i += 1) {
        await token.mint(await signers[i].getAddress(), initialTokenAmount);
    }

    // Return the Fuel harness object
    return {
        contractAddresses: await getContractAddresses(contracts),
        fuelChainConsensus: contracts.fuelChainConsensus,
        fuelMessagePortal: contracts.fuelMessagePortal,
        fuelERC20Gateway: contracts.fuelERC20Gateway,
        token,
        poaSigner,
        poaSignerAddress,
        signer,
        signers,
        addresses: (await ethers.getSigners()).map((v) => v.address),
        initialTokenAmount,
    };
}

// The full contract deployment for Fuel.
export async function deployFuel(poaSignerAddress?: string): Promise<DeployedContracts> {
    poaSignerAddress = poaSignerAddress || (await ethers.getSigners())[0].address;

    // Deploy fuel chain consensus contract
    const FuelChainConsensus = await ethers.getContractFactory('FuelChainConsensus');
    const fuelChainConsensus = (await upgrades.deployProxy(FuelChainConsensus, [poaSignerAddress], {
        initializer: 'initialize',
    })) as FuelChainConsensus;
    await fuelChainConsensus.deployed();

    // Deploy message portal contract
    const FuelMessagePortal = await ethers.getContractFactory('FuelMessagePortal');
    const fuelMessagePortal = (await upgrades.deployProxy(FuelMessagePortal, [fuelChainConsensus.address], {
        initializer: 'initialize',
    })) as FuelMessagePortal;
    await fuelMessagePortal.deployed();

    // Deploy gateway contract for ERC20 bridging
    const FuelERC20Gateway = await ethers.getContractFactory('FuelERC20Gateway');
    const fuelERC20Gateway = (await upgrades.deployProxy(FuelERC20Gateway, [fuelMessagePortal.address], {
        initializer: 'initialize',
    })) as FuelERC20Gateway;
    await fuelERC20Gateway.deployed();

    // Return deployed contracts
    return {
        fuelChainConsensus,
        fuelMessagePortal,
        fuelERC20Gateway,
    };
}

// The full contract deployment for Fuel.
export async function upgradeFuel(
    contracts: DeployedContractAddresses,
    signer?: Signer
): Promise<DeployedContractAddresses> {
    // Upgrade fuel chain consensus contract
    const FuelChainConsensus = await ethers.getContractFactory('FuelChainConsensus', signer);
    await upgrades.forceImport(contracts.FuelChainConsensus, FuelChainConsensus, { kind: 'uups' });
    await upgrades.upgradeProxy(contracts.FuelChainConsensus, FuelChainConsensus);

    // Upgrade message portal contract
    const FuelMessagePortal = await ethers.getContractFactory('FuelMessagePortal', signer);
    await upgrades.forceImport(contracts.FuelMessagePortal, FuelMessagePortal, { kind: 'uups' });
    await upgrades.upgradeProxy(contracts.FuelMessagePortal, FuelMessagePortal);

    // Upgrade gateway contract for ERC20 bridging
    const FuelERC20Gateway = await ethers.getContractFactory('FuelERC20Gateway', signer);
    await upgrades.forceImport(contracts.FuelERC20Gateway, FuelERC20Gateway, { kind: 'uups' });
    await upgrades.upgradeProxy(contracts.FuelERC20Gateway, FuelERC20Gateway);

    // Return deployed contracts
    contracts.FuelChainConsensus_impl = await upgrades.erc1967.getImplementationAddress(contracts.FuelChainConsensus);
    contracts.FuelMessagePortal_impl = await upgrades.erc1967.getImplementationAddress(contracts.FuelMessagePortal);
    contracts.FuelERC20Gateway_impl = await upgrades.erc1967.getImplementationAddress(contracts.FuelERC20Gateway);
    return contracts;
}
