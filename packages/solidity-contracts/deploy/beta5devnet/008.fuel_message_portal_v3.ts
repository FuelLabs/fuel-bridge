import { MaxUint256 } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortalV3 } from '../../typechain';

import { RATE_LIMIT_DURATION } from '../../protocol/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { upgradeProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const fuelMessagePortal = await get('FuelMessagePortal');

  const contract = await upgradeProxy(
    fuelMessagePortal.address,
    new FuelMessagePortalV3(deployer),
    {
      unsafeAllow: ['constructor'],
      constructorArgs: [MaxUint256, RATE_LIMIT_DURATION],
    }
  );
  const address = await contract.getAddress();

  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Upgraded FuelMessagePortal at', address);
  await save('FuelMessagePortal', {
    address,
    abi: [],
    implementation,
  });

  const portal = FuelMessagePortalV3.connect(address, deployer);

  await portal
    .pauseWithdrawals()
    .then((tx) => {
      console.log('Pausing withdrawals...', tx.hash);
      return tx.wait();
    })
    .then(() => console.log('Withdrawals paused'));

  return true;
};

func.tags = ['upgrade_portal_v3', 'message_portal_v3', 'FuelMessagePortalV3'];
func.id = 'fuel_message_portal_v3_upgrade';
export default func;
