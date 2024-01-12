import {
  logETHBalances,
  getOrDeployECR20Contract,
  getOrDeployFuelTokenContract,
  FUEL_TX_PARAMS,
  getTokenId,
} from '@fuel-bridge/test-utils';

// This script is a demonstration of how ERC-20 tokens are bridged to and from the Fuel chain
(async function () {
  // load ERC20 contract
  const ethTestToken = await getOrDeployECR20Contract(env);

  // load Fuel side fungible token contract
  const fuelTestToken = await getOrDeployFuelTokenContract(
    {} as any,
    ethTestToken,
    { address: '0x180506B8828094862d94C121307a21ad4Ab8c6DE' },
    FUEL_TX_PARAMS
  );
  const fuelTestTokenId = getTokenId(fuelTestToken);

  console.log('contract', fuelTestToken);
  console.log('id', fuelTestTokenId);
})();
