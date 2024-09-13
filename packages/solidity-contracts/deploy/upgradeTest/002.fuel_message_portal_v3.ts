import { MaxUint256 } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import {
  RATE_LIMIT_AMOUNT,
  RATE_LIMIT_DURATION,
} from '../../protocol/constants';
import { FuelMessagePortalV3__factory as FuelMessagePortal } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const { address: fuelChainState } = await get('FuelChainState');

  const constructorArgs = [MaxUint256, RATE_LIMIT_DURATION];

  const contract = await deployProxy(
    new FuelMessagePortal(deployer),
    [fuelChainState, RATE_LIMIT_AMOUNT.toString()],
    {
      initializer: 'initializerV3',
      constructorArgs,
    }
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelMessagePortal at', address);
  await save('FuelMessagePortal', {
    address,
    abi: [...FuelMessagePortal.abi],
    implementation,
    linkedData: { factory: 'FuelMessagePortal', constructorArgs },
  });
};

func.tags = ['portal', 'message_portal', 'FuelMessagePortal'];
func.id = 'fuel_message_portal';
export default func;
