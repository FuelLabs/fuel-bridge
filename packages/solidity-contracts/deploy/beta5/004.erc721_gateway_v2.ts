import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC721GatewayV2__factory as FuelERC721GatewayV2 } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const fuelMessagePortal = await get('FuelMessagePortal');

  const { deployTransaction, address } = await deployProxy(
    new FuelERC721GatewayV2(deployer),
    [fuelMessagePortal.address],
    {
      initializer: 'initialize',
    }
  );

  await deployTransaction.wait();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelERC721GatewayV2 at', address);
  await save('FuelERC721GatewayV2', {
    address,
    abi: [],
    implementation,
  });

  return true;
};

func.tags = ['erc721', 'erc721_gateway', 'FuelERC721GatewayV2'];
func.id = 'fuel_erc721_gateway_v2';
export default func;
