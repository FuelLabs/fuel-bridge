// Useful and defined constants of the Fuel system
export const EMPTY =
  '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
export const ZERO =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export const CONTRACT_MESSAGE_PREDICATE =
  '0xe821b978bcce9abbf40c3e50ea30143e68c65fa95b9da8907fef59c02d954cec';

// From application header: https://github.com/FuelLabs/fuel-specs/blob/master/src/protocol/block-header.md
export const CONSENSUS_PARAMETERS_VERSION = 0n;
export const STATE_TRANSITION_BYTECODE_VERSION = 0n;
export const STANDARD_TOKEN_DECIMALS = 18;
export const RATE_LIMIT_AMOUNT = 10e18; // 10 ether
export const RATE_LIMIT_DURATION = 604800; // 1 week
