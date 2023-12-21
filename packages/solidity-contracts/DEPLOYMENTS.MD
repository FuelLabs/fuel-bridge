# List of current deployments

Check the folder `/deployments` for up to date values!

## Beta 5 Production

```
Deployed FuelChainState at 0x395B125343ADebCcB05dd70e117774E3AB08a8a7
Deployed FuelMessagePortal at 0x557c5cE22F877d975C2cB13D0a961a182d740fD5
Deployed FuelERC20GatewayV2 at 0xE52af7c9A2F6b243CEE9F0C423E06BAb6E5c6E3b
Deployed FuelERC721GatewayV2 at 0xc094fC648101920B1C37C733AF022942eF4042D3
```

## Beta 5 Devnet

NOTE: CUSTOM VALUES FOR COMMIT INTERVAL AND FINALIZATION TIME

```ts
// BLOCKS_PER_COMMIT_INTERVAL = (num of blocks per minute * target interval in minutes)
uint256 public constant BLOCKS_PER_COMMIT_INTERVAL = 60;
// Time to fianlize in seconds
// TIME_TO_FINALIZE = target interval in minutes * 60
uint256 public constant TIME_TO_FINALIZE = 600; // Custom value for devnet
```

```
Deployed FuelChainState at 0x7E2F8d3cDe4dE62948DACE602A05EEf67C5351c2
Deployed FuelMessagePortal at 0xb4dA7bdBaa8F1D76EEE2049a1159CD24915c4797
Deployed FuelERC20GatewayV2 at 0x3F356E0Cf09974a8a62Ba2AFeDf442d1cB5e389a
Deployed FuelERC721GatewayV2 at 0x975080C59bD5a7C302ef7E4f9F76258B14663A34
Upgraded FuelMessagePortal at 0xb4dA7bdBaa8F1D76EEE2049a1159CD24915c4797
```