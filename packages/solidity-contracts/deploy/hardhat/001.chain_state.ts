import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory as FuelChainState } from '../../typechain';

const BLOCKS_PER_COMMIT_INTERVAL = 30;
const TIME_TO_FINALIZE = 5;
const COMMIT_COOLDOWN = TIME_TO_FINALIZE;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { save },
  } = hre;

  const [deployer] = await ethers.getSigners();

  const contract = await deployProxy(new FuelChainState(deployer), [], {
    initializer: 'initialize',
    constructorArgs: [
      TIME_TO_FINALIZE,
      BLOCKS_PER_COMMIT_INTERVAL,
      COMMIT_COOLDOWN,
    ],
  });
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelChainState at', address);
  await save('FuelChainState', {
    address,
    abi: [...FuelChainState.abi],
    implementation,
  });
};

func.tags = ['state', 'chain-state', 'chain_state', 'FuelChainState'];
func.id = 'chain_state';
export default func;
