import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

const ASSET_ISSUER_PROXY_ID =
  '0xd02112ef9c39f1cea7c8527c26242ca1f5d26bcfe8d1564bee054d3b04175471';

const ASSET_ISSUER_IMPL_ID =
  '0xf40c4b60fc238f3554c780701f7b59a93338e16f450908ba2d1e2041ddf3d9ac';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;
  const [deployer] = await ethers.getSigners();

  await deployments.execute(
    'FuelERC20GatewayV4',
    { log: true, from: deployer.address },
    'setAssetIssuerId',
    ASSET_ISSUER_PROXY_ID
  );

  await deployments.save('FuelL2BridgeId', {
    address: ASSET_ISSUER_PROXY_ID,
    abi: [],
    implementation: ASSET_ISSUER_IMPL_ID,
  });

  return true;
};

func.tags = ['set_asset_issuer_redeploy'];
func.id = 'set_asset_issuer_redeploy';
export default func;
