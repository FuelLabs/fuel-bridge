/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.
import { ethers, BigNumber } from 'ethers';
import { BN } from 'fuels';
import { ETHEREUM_ETH_DECIMALS, FUEL_ETH_DECIMALS } from './constants';

// Parse ETH value as a string
export function fuels_parseEther(ether: string): BN {
  let val = ethers.utils.parseEther(ether);
  val = val.div(10 ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS));
  return new BN(val.toHexString());
}

// Format ETH value to a string
export function fuels_formatEther(ether: BN): string {
  let val = BigNumber.from(ether.toHex());
  val = val.mul(10 ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS));
  return ethers.utils.formatEther(val);
}

// Parse any string value using the given decimal amount
export function fuels_parseToken(value: string, decimals: number = 9): BN {
  let val = ethers.utils.parseEther(value);
  val = val.div(10 ** (ETHEREUM_ETH_DECIMALS - decimals));
  return new BN(val.toHexString());
}

// Format any value to a string using the given decimal amount
export function fuels_formatToken(value: BN, decimals: number = 9): string {
  let val = BigNumber.from(value.toHex());
  val = val.mul(10 ** (ETHEREUM_ETH_DECIMALS - decimals));
  return ethers.utils.formatEther(val);
}

// Parse any string value using the given decimal amount
export function ethers_parseToken(value: string, decimals: number = 18): BigNumber {
  let val = ethers.utils.parseEther(value);
  return val.div(10 ** (ETHEREUM_ETH_DECIMALS - decimals));
}

// Format any value to a string using the given decimal amount
export function ethers_formatToken(value: BigNumber, decimals: number = 18): string {
  value = value.mul(10 ** (ETHEREUM_ETH_DECIMALS - decimals));
  return ethers.utils.formatEther(value);
}

export function fuel_to_eth_address(address: string): string {
  return `0x${address.substring(26)}`.toLowerCase();
}

export function eth_address_to_b256(address: string): string {
  return `0x000000000000000000000000${address.toLowerCase()}`.toLowerCase();
}
