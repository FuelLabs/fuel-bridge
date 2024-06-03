import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    deployments: { execute },
  } = hre;
  const [deployer] = await ethers.getSigners();
  await execute(
    'FuelMessagePortal',
    { log: true, from: deployer.address },
    'unpause'
  );

  return true;
};

func.tags = ['portal_unpause'];
func.id = 'portal_unpause';
export default func;
