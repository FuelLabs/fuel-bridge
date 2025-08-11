import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory as FuelChainState } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { upgradeProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const fuelChainState = await get('FuelChainState');

  const BLOCKS_PER_COMMIT_INTERVAL = 10800;
  const TIME_TO_FINALIZE = 3600 * 24;
  const COMMIT_COOLDOWN = TIME_TO_FINALIZE;

  const constructorArgs = [
    TIME_TO_FINALIZE,
    BLOCKS_PER_COMMIT_INTERVAL,
    COMMIT_COOLDOWN,
  ];
  const contract = await upgradeProxy(
    fuelChainState.address,
    new FuelChainState(deployer),
    {
      unsafeAllow: ['constructor'],
      constructorArgs
    }
  );
  const address = await contract.getAddress();

  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Upgraded FuelChainState at', address);
  await save('FuelChainState', {
    address,
    abi: [...FuelChainState.abi],
    implementation,
    linkedData: {
      constructorArgs,
      factory: 'FuelChainState',
    },
  });

  return true;
};

func.tags = ['chain_state_time_finalize_upgrade'];
func.id = 'chain_state_time_finalize_upgrade';
export default func;