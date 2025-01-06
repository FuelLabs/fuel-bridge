export function fuel_to_eth_address(address: string): string {
  return `0x${address.substring(26)}`.toLowerCase();
}

export function eth_address_to_b256(address: string): string {
  return `0x000000000000000000000000${address.toLowerCase()}`.toLowerCase();
}
