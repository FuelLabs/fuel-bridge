import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory as FuelChainState } from '../../typechain';

const BLOCKS_PER_COMMIT_INTERVAL = 10800;
const TIME_TO_FINALIZE = 3600 * 24 * 7; // 7 days of finalization
const COMMIT_COOLDOWN = TIME_TO_FINALIZE;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { upgradeProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const fuelChainState = await get('FuelChainState');

  const contract = await upgradeProxy(
    fuelChainState.address,
    new FuelChainState(deployer),
    {
      unsafeAllow: ['constructor'],
      constructorArgs: [
        TIME_TO_FINALIZE,
        BLOCKS_PER_COMMIT_INTERVAL,
        COMMIT_COOLDOWN,
      ],
    }
  );
  const address = await contract.getAddress();

  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Upgraded FuelChainState at', address);
  await save('FuelChainState', {
    address,
    abi: [...FuelChainState.abi],
    implementation,
  });

  return true;
};

func.tags = ['state_upgrade_2'];
func.id = 'state_upgrade_2';
export default func;
