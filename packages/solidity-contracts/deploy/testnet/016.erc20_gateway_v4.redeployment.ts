import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC20GatewayV4__factory as FuelERC20Gateway } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const contract = await deployProxy(
    new FuelERC20Gateway(deployer),
    ['0x01855B78C1f8868DE70e84507ec735983bf262dA'],
    {
      initializer: 'initialize',
    }
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelERC20GatewayV4 at', address);
  await save('FuelERC20GatewayV4', {
    address,
    abi: [...FuelERC20Gateway.abi],
    implementation,
  });

  return true;
};

func.tags = ['gateway_redeploy'];
func.id = 'gateway_redeploy';
export default func;
