import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import { ethers } from 'hardhat';

const func: DeployFunction = async function deployFunction(
  hre: HardhatRuntimeEnvironment
) {
  const {
    deployments: { deploy, save },
  } = hre;

  const [deployer] = await ethers.getSigners();

  const cryDeployment = await deploy('CRY', {
    from: deployer.address,
    args: [],
    log: true,
  });

  await save('CRY', {
    address: cryDeployment.address,
    abi: cryDeployment.abi,
  });

  console.log('Deployed CRY at:', cryDeployment.address);
};

func.tags = ['token', 'CRY_ERC20'];
func.id = 'deploy_token_and_cry';
export default func;
