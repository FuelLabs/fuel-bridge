import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC20GatewayV4__factory as FuelERC20Gateway } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const fuelMessagePortal = await get('FuelMessagePortalV3');

  const initArgs = [fuelMessagePortal.address];

  const contract = await deployProxy(new FuelERC20Gateway(deployer), initArgs, {
    initializer: 'initialize',
  });
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelERC20GatewayV4 at', address);
  await save('FuelERC20GatewayV4', {
    address,
    abi: [...FuelERC20Gateway.abi],
    implementation,
    linkedData: {
      factory: 'FuelERC20GatewayV4',
      constructorArgs: [],
      initArgs,
      isProxy: true,
      isImplementation: false,
    },
  });
};

func.tags = ['erc20', 'erc20_gateway', 'FuelERC20GatewayV4'];
func.id = 'fuel_erc20_gateway_v4';
export default func;
