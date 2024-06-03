import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

const ASSET_ISSUER_ADDRESS =
  '0xf7e9720adf816640b4e0b91ab192d3d2e549cf978ab2318d45862f0cbc2e9f80';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;
  const [deployer] = await ethers.getSigners();

  await deployments.execute(
    'FuelERC20GatewayV4',
    { log: true, from: deployer.address },
    'setAssetIssuerId',
    ASSET_ISSUER_ADDRESS
  );

  return true;
};

func.tags = ['set_asset_issuer'];
func.id = 'set_asset_issuer';
export default func;
