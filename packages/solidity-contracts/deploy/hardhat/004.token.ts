import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

/**
 * @description Deployed for testing purposes
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    deployments: { deploy },
  } = hre;

  const [deployer] = await ethers.getSigners();

  await deploy('Token', { from: deployer.address, log: true });

  return true;
};

func.tags = ['token'];
func.id = 'token';
export default func;
