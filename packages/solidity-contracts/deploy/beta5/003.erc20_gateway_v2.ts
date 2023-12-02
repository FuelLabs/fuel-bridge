import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC20GatewayV2__factory as FuelERC20GatewayV2 } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const fuelMessagePortal = await get('FuelMessagePortal');

  const { deployTransaction, address } = await deployProxy(
    new FuelERC20GatewayV2(deployer),
    [fuelMessagePortal.address],
    {
      initializer: 'initialize',
    }
  );

  await deployTransaction.wait();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelERC20GatewayV2 at', address);
  await save('FuelERC20GatewayV2', {
    address,
    abi: [],
    implementation,
  });

  return true;
};

func.tags = ['erc20', 'erc20_gateway', 'FuelERC20GatewayV2'];
func.id = 'fuel_erc20_gateway_v2';
export default func;
