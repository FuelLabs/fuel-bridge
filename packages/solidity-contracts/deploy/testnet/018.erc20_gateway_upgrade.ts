import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC20GatewayV4__factory as FuelERC20Gateway } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { upgradeProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const { address } = await get('FuelERC20GatewayV4');

  const contract = await upgradeProxy(address, new FuelERC20Gateway(deployer));
  await contract.waitForDeployment();

  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Upgraded FuelERC20GatewayV4 to', implementation);
  await save('FuelERC20GatewayV4', {
    address,
    abi: [...FuelERC20Gateway.abi],
    implementation,
  });

  return true;
};

func.tags = ['gateway_upgrade'];
func.id = 'gateway_upgrade';
export default func;
