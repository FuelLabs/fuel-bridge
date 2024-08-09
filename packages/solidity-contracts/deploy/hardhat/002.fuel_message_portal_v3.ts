import { MaxUint256 } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortal } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const { address: fuelChainState } = await get('FuelChainState');

  const rateLimitAmount = 10e18;
  const rateLimitDuration = 604800;

  const contract = await deployProxy(
    new FuelMessagePortal(deployer),
    [fuelChainState, rateLimitAmount, rateLimitDuration],
    {
      initializer: 'initialize',
      constructorArgs: [MaxUint256],
    }
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
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
