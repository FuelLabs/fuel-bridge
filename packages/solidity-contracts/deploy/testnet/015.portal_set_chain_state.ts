import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    deployments: { get, execute },
  } = hre;

  const [deployer] = await ethers.getSigners();
  const { address: fuelChainState } = await get('FuelChainState');

  await execute(
    'FuelMessagePortal',
    { log: true, from: deployer.address },
    'setFuelChainState',
    fuelChainState
  );

  return true;
};

func.tags = ['portal_set_chain_state'];
func.id = 'portal_set_chain_state';
export default func;
