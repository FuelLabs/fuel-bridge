/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.
import { ethers, BigNumber } from 'ethers';

// Constants
const ETHEREUM_ETH_DECIMALS: number = 18;
const FUEL_ETH_DECIMALS: number = 9;

// Parse ETH value as a string
export function fuels_parseEther(ether: string): bigint {
	const val = ethers.utils.parseEther("1").div(10 ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS));
	return val.toBigInt();
}

// Format ETH value to a string
export function fuels_formatEther(ether: bigint): string {
	let val = BigNumber.from(ether);
	val = val.mul(10 ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS));
	return ethers.utils.formatEther(val);
}
