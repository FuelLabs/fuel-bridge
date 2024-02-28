/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.
import { formatEther, parseEther, toBeHex } from 'ethers';
import { BN } from 'fuels';

import { ETHEREUM_ETH_DECIMALS, FUEL_ETH_DECIMALS } from './constants';

// Parse ETH value as a string
export function fuels_parseEther(ether: string): BN {
  let val = parseEther(ether);
  val = val / 10n ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS);
  return new BN(toBeHex(val));
}

// Format ETH value to a string
export function fuels_formatEther(ether: BN): string {
  let val = BigInt(ether.toHex());
  val = val * 10n ** (ETHEREUM_ETH_DECIMALS - FUEL_ETH_DECIMALS);
  return formatEther(val);
}

// Parse any string value using the given decimal amount
export function fuels_parseToken(
  value: string,
  decimals: bigint | number = 9n
): BN {
  let val = parseEther(value);
  if (typeof decimals === 'number') decimals = BigInt(decimals);
  val = val / 10n ** (ETHEREUM_ETH_DECIMALS - decimals);
  return new BN(toBeHex(val));
}

// Format any value to a string using the given decimal amount
export function fuels_formatToken(
  value: BN,
  decimals: bigint | number = 9n
): string {
  let val = BigInt(value.toHex());
  if (typeof decimals === 'number') decimals = BigInt(decimals);
  val = val * 10n ** (ETHEREUM_ETH_DECIMALS - decimals);
  return formatEther(val);
}

// Parse any string value using the given decimal amount
export function ethers_parseToken(
  value: string,
  decimals: bigint | number = 18n
): bigint {
  const val = parseEther(value);
  if (typeof decimals === 'number') decimals = BigInt(decimals);
  return val / 10n ** (ETHEREUM_ETH_DECIMALS - decimals);
}

// Format any value to a string using the given decimal amount
export function ethers_formatToken(
  value: bigint,
  decimals: bigint | number = 18n
): string {
  if (typeof decimals === 'number') decimals = BigInt(decimals);
  value = value * 10n ** (ETHEREUM_ETH_DECIMALS - decimals);
  return formatEther(value);
}

export function fuel_to_eth_address(address: string): string {
  return `0x${address.substring(26)}`.toLowerCase();
}

export function eth_address_to_b256(address: string): string {
  return `0x000000000000000000000000${address.toLowerCase()}`.toLowerCase();
}
