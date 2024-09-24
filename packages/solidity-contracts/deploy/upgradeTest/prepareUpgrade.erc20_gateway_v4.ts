import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC20GatewayV4__factory as FuelERC20Gateway } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    upgrades: { prepareUpgrade },
    deployments: { save },
  } = hre;

  const contractDeployment = await hre.deployments.get('FuelERC20GatewayV4');

  const contract = await hre.ethers.getContractFactory('FuelERC20GatewayV4');

  const implementationAddress = await prepareUpgrade(
    contractDeployment.address,
    contract,
    {
      kind: 'uups',
      constructorArgs: contractDeployment.linkedData.constructorArgs,
    }
  );

  await save('FuelERC20GatewayV4', {
    address: contractDeployment.address,
    abi: [...FuelERC20Gateway.abi],
    implementation: contractDeployment.implementation,
    linkedData: {
      factory: 'FuelERC20GatewayV4',
      constructorArgs: contractDeployment.linkedData.constructorArgs,
      initArgs: contractDeployment.linkedData.initArgs,
      isProxy: false,
      newImplementation: implementationAddress.toString(),
    },
  });
};

func.tags = ['prepareUpgrade_erc20_gateway_v4'];
func.id = 'prepareUpgrade_erc20_gateway_v4';
export default func;
