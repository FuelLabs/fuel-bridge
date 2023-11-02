export function addressToB256(address: string) {
  return address.split('0x').join('0x000000000000000000000000');
}

export function b256ToAddress(b256: string) {
  return '0x' + b256.substring(26);
}
