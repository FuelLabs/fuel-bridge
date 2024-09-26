import { MaxUint256, parseUnits } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV4__factory as FuelMessagePortal } from '../../typechain';

const ETH_DEPOSIT_LIMIT = MaxUint256;
const FTI_GAS_LIMIT = 2n ** 64n - 1n;
const FTI_MIN_GAS_PRICE = parseUnits('1', 'gwei');
const FTI_MIN_GAS_PER_TX = 10_000;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const { address: fuelChainState } = await get('FuelChainState');

  const contract = await deployProxy(
    new FuelMessagePortal(deployer),
    [fuelChainState],
    {
      initializer: 'initialize',
      constructorArgs: [
        ETH_DEPOSIT_LIMIT,
        FTI_GAS_LIMIT,
        FTI_MIN_GAS_PER_TX,
        FTI_MIN_GAS_PRICE,
      ],
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
  });

  return true;
};

func.tags = ['portal', 'message_portal', 'FuelMessagePortal'];
func.id = 'fuel_message_portal';
export default func;
