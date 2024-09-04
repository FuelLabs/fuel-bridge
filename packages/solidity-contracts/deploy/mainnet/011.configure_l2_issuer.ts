import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

const ASSET_ISSUER_PROXY_ID =
  '0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8';
const ASSET_ISSUER_IMPL_ID =
  '0xa8ccd6fee8a8a7160a76aefdf37f235c9f9aaf38f1fd5f3299c48e4ee57802d2';

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

func.tags = ['set_asset_issuer'];
func.id = 'set_asset_issuer';
export default func;
