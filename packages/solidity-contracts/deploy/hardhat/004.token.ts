import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
const {
ethers,
deployments: { deploy, save },
} = hre;
const [deployer] = await ethers.getSigners();
// Deploy the existing Token contract
const tokenDeployment = await deploy('Token', {
from: deployer.address,
log: true,
});
// Save the Token deployment details
await save('Token', {
address: tokenDeployment.address,
abi: tokenDeployment.abi,
});
// Deploy the CRY contract
const cryDeployment = await deploy('CRY', {
from: deployer.address,
args: [], // Add constructor arguments if any
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
func.tags = ['token', 'CRY'];
func.id = 'deploy_token_and_cry';
export default func;