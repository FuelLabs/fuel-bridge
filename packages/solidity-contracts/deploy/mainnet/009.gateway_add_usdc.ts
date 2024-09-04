import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import { parseUnits } from 'ethers';

const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;
  const [deployer] = await ethers.getSigners();

  await deployments.execute(
    'FuelERC20GatewayV4',
    { log: true, from: deployer.address },
    'setGlobalDepositLimit',
    USDC_ADDRESS,
    // param `limit` must be down/up scaled according to _adjustDepositDecimals
    // USDC => 6 decimals => it will not have any scaling
    parseUnits('100000', 6)
  );

  return true;
};

func.tags = ['gateway_whitelist_usdc'];
func.id = 'gateway_whitelist_usdc';
export default func;
