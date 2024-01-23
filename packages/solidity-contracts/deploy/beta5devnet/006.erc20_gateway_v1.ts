import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC20Gateway__factory as FuelERC20GatewayV1 } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;

  const [deployer] = await ethers.getSigners();

  const fuelMessagePortal = await get('FuelMessagePortal');

  const { deployTransaction, address } = await deployProxy(
    new FuelERC20GatewayV1(deployer),
    [fuelMessagePortal.address],
    {
      initializer: 'initialize',
    }
  );

  await deployTransaction.wait();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelERC20GatewayV1 at', address);
  await save('FuelERC20GatewayV1', {
    address,
    abi: [],
    implementation,
  });

  return true;
};

func.tags = ['erc20V1', 'erc20_gatewayV1', 'FuelERC20GatewayV1'];
func.id = 'fuel_erc20_gateway_V1';
export default func;
