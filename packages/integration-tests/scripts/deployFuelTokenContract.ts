import { TestEnvironment, setupEnvironment } from './setup';
import { getOrDeployFuelTokenContract } from './utils/fuels/getOrDeployFuelTokenContract';
import { getOrDeployECR20Contract } from './utils/ethers/getOrDeployECR20Contract';
import { FUEL_TX_PARAMS } from './utils/constants';
import { saveDeploymentsFile } from './utils/deployment';

(async function () {
  const env: TestEnvironment = await setupEnvironment({});

  const ethTestToken = await getOrDeployECR20Contract(env);
  const fuelTestToken = await getOrDeployFuelTokenContract(env, ethTestToken, FUEL_TX_PARAMS);

  // Write deployments to file
  await saveDeploymentsFile({
    fuelTokenContractId: fuelTestToken.id.toAddress()
  });
})();
