import { parseUnits } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ONE_WEEK_IN_SECONDS = 3600 * 24 * 7;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;
  const [deployer] = await ethers.getSigners();

  await deployments.execute(
    'FuelERC20GatewayV4',
    { log: true, from: deployer.address },
    'resetRateLimitAmount',
    USDC_ADDRESS,
    // param `limit` must be down/up scaled according to _adjustDepositDecimals
    // USDC => 6 decimals => it will not have any scaling
    parseUnits('25000', 6), // 250k USDC
    ONE_WEEK_IN_SECONDS // 1 week of rate limit epochs
  );

  return true;
};

func.tags = ['gateway_rate_limit_usdc'];
func.id = 'gateway_rate_limit_usdc';
export default func;
