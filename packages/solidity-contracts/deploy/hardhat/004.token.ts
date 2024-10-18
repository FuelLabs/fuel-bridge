import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import { ethers } from 'hardhat';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, save },
  } = hre;

  const [deployer] = await ethers.getSigners();

  // Deploy the CustomToken contract
  const tokenDeployment = await deploy('Token', {
    from: deployer.address,
    log: true,
  });

  // Save the CustomToken deployment details
  await save('Token', {
    address: tokenDeployment.address,
    abi: tokenDeployment.abi,
  });

  // Connect to the deployed CustomToken contract
  const CustomToken = await ethers.getContractAt('CustomToken', tokenDeployment.address);

  // Set decimals to 6 for CustomToken
  const setDecimalsTx = await CustomToken.setDecimals(6);
  await setDecimalsTx.wait();
  console.log(`Set CustomToken decimals to 6`);

  // Deploy the CRY contract
  const cryDeployment = await deploy('CRY', {
    from: deployer.address,
    args: [], // No constructor arguments needed as per CRY.sol
    log: true,
  });

  // Save the CRY deployment details
  await save('CRY', {
    address: cryDeployment.address,
    abi: cryDeployment.abi,
  });

  console.log('Deployed Token at:', tokenDeployment.address);
  console.log('Deployed CRY at:', cryDeployment.address);
};

func.tags = ['token', 'CRY_ERC20'];
func.id = 'deploy_token_and_cry';
export default func;
