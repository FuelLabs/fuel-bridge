import { getOrDeployFuelTokenContract, setupEnvironment, getOrDeployECR20Contract, FUEL_TX_PARAMS } from '@fuel-bridge/integration-tests';

import { saveDeploymentsFile } from './utils/deployment';

(async function () {
  const env = await setupEnvironment({});

  const ethTestToken = await getOrDeployECR20Contract(env);
  const fungibleToken = await getOrDeployFuelTokenContract(env, ethTestToken, FUEL_TX_PARAMS);


  // Write deployments to file
  await saveDeploymentsFile({
    fuelFungibleTokenId: fungibleToken.id.toAddress()
  });
})();
