
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortal__factory as FuelMessagePortal } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const { address: fuelChainState } = await get('FuelChainState');

  const { deployTransaction, address } = await deployProxy(
    new FuelMessagePortal(deployer),
    [fuelChainState],
    {
      initializer: 'initialize',
    }
  );

  await deployTransaction.wait();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelMessagePortal at', address);
  await save('FuelMessagePortal', {
    address,
    abi: [],
    implementation,
  });

  return true;
};

func.tags = ['portal', 'message_portal', 'FuelMessagePortal'];
func.id = 'fuel_message_portal';
export default func;
