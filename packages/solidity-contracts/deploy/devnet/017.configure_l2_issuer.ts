import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

const ASSET_ISSUER_PROXY_ID =
  '0x12f300d6d2b286dd5d290b709e0d3d73acc23c87ec10d349d4386b9524d740a1';

const ASSET_ISSUER_IMPL_ID =
  '0x191f58253e324d85e66bdd20bf3d2d0ff55f0189e71387498783b07997c9a854';

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
