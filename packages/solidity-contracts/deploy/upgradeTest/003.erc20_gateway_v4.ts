import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC20GatewayV4__factory as FuelERC20Gateway } from '../../typechain';

import fs from 'fs';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { deployProxy, erc1967 },
    deployments: { get, save },
  } = hre;
  const [deployer] = await ethers.getSigners();

  const fuelMessagePortal = await get('FuelMessagePortal');

  const contract = await deployProxy(
    new FuelERC20Gateway(deployer),
    [fuelMessagePortal.address],
    {
      initializer: 'initialize',
    }
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const implementation = await erc1967.getImplementationAddress(address);

  console.log('Deployed FuelERC20GatewayV4 at', address);
  await save('FuelERC20GatewayV4', {
    address,
    abi: [...FuelERC20Gateway.abi],
    implementation,
  });

  // storing the contract info in a common file so the verification script can read and process all deployments/upgrades together during ci workflow
  const deployment = {
    address: address,
    contractName: 'FuelERC20GatewayV4',
    network: hre.network.name,
    isProxy: true,
    isImplementation: false,
  };

  let deployments = [];
  const deploymentsFile = `deployments/${hre.network.name}/${hre.network.name}.json`;
  if (fs.existsSync(deploymentsFile)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsFile, 'utf8'));
  }

  deployments.push(deployment);

  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));
};

func.tags = ['erc20', 'erc20_gateway', 'FuelERC20GatewayV4'];
func.id = 'fuel_erc20_gateway_v4';
export default func;
