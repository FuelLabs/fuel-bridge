/// @dev The Fuel testing harness.
/// A set of useful helper methods for testing Fuel.
import { ethers } from 'hardhat';
import { BigNumber as BN, Signer } from 'ethers';
import { FuelSidechainConsensus } from '../typechain/FuelSidechainConsensus.d';
import { FuelMessagePortal } from '../typechain/FuelMessagePortal.d';
import { L1ERC20Gateway } from '../typechain/L1ERC20Gateway.d';
import { Token } from '../typechain/Token.d';
import { BinaryMerkleTree } from '../typechain/BinaryMerkleTree.d';
import { computeAddress, SigningKey } from 'ethers/lib/utils';

// This is the Harness Object.
export interface HarnessObject {
	binaryMerkleTreeLib: BinaryMerkleTree;
	fuelMessagePortal: FuelMessagePortal;
	fuelSidechain: FuelSidechainConsensus;
	l1ERC20Gateway: L1ERC20Gateway;
	token: Token;
	poaSigner: SigningKey;
	poaSignerAddress: string;
	signer: string;
	signers: Array<Signer>;
	addresses: Array<string>;
	initialTokenAmount: BN;
}

// The setup method for Fuel.
export async function setupFuel(): Promise<HarnessObject> {
	// Deploy libraries

	// Deploy binary merkle tree library
	const binaryMerkleTreeLibFactory = await ethers.getContractFactory('BinaryMerkleTree');
	const binaryMerkleTreeLib: BinaryMerkleTree =
		(await binaryMerkleTreeLibFactory.deploy()) as BinaryMerkleTree;
	await binaryMerkleTreeLib.deployed();

	// ---

	// Initial token amount
	const initialTokenAmount = ethers.utils.parseEther('1000000');

	// Deploy a token for deposit testing.
	const tokenFactory = await ethers.getContractFactory('Token');
	const token: Token = (await tokenFactory.deploy()) as Token;
	await token.deployed();

	// Set signer
	const poaSigner = new SigningKey(
		'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
	);
	const poaSignerAddress = computeAddress(poaSigner.privateKey);
	const signer = (await ethers.getSigners())[0].address;
	const signers = await ethers.getSigners();

	// Mint some dummy token for deposit testing
	for (let i = 0; i < signers.length; i += 1) {
		await token.mint(await signers[i].getAddress(), initialTokenAmount);
	}

	// Setup factories for Message Portal and Fuel Consensus contract
	const fuelSidechainFactory = await ethers.getContractFactory('FuelSidechainConsensus');
	const fuelMessagePortalFactory = await ethers.getContractFactory('FuelMessagePortal', {
		libraries: {
			BinaryMerkleTree: binaryMerkleTreeLib.address,
		},
	});

	// Deploy Fuel Sidechain contract
	const fuelSidechain: FuelSidechainConsensus = (await fuelSidechainFactory.deploy(
		poaSignerAddress
	)) as FuelSidechainConsensus;
	await fuelSidechain.deployed();

	// Deploy Message Portal contract
	const fuelMessagePortal: FuelMessagePortal = (await fuelMessagePortalFactory.deploy(
		fuelSidechain.address
	)) as FuelMessagePortal;
	await fuelMessagePortal.deployed();

	// Deploy Gateway contract for ERC20 bridging
	const l1ERC20GatewayFactory = await ethers.getContractFactory('L1ERC20Gateway');
	const l1ERC20Gateway: L1ERC20Gateway = (await l1ERC20GatewayFactory.deploy(
		fuelMessagePortal.address
	)) as L1ERC20Gateway;
	await l1ERC20Gateway.deployed();

	// Return the Fuel harness object.
	return {
		binaryMerkleTreeLib,
		fuelSidechain,
		fuelMessagePortal,
		l1ERC20Gateway,
		token,
		poaSigner,
		poaSignerAddress,
		signer,
		signers,
		addresses: (await ethers.getSigners()).map((v) => v.address),
		initialTokenAmount,
	};
}
