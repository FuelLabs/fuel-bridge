import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelChainState__factory as FuelChainState } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { save, execute },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const contract = await deployProxy(new FuelChainState(deployer), [], {
    initializer: 'initialize',
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

  await execute(
    'FuelChainState',
    { log: true, from: deployer.address },
    'pause'
  );

  return true;
};

func.tags = ['state', 'chain-state', 'chain_state', 'FuelChainState'];
func.id = 'chain_state_redeploy';
export default func;
