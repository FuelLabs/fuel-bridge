import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

const ASSET_ISSUER_PROXY_ID =
  '0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8';
const ASSET_ISSUER_IMPL_ID =
  '0x0ceafc5ef55c66912e855917782a3804dc489fb9e27edfd3621ea47d2a281156';

const ASSET_ISSUER_DEPLOY_OPTS = {
  storageSlots: [
    {
      key: '98437ca47af18022b9c1ac8bb7a1f9250530840d04707415ba2a4209cd03e82e',
      value: '0000000000000000000000000000000000000000000000000000000000000000',
    },
  ],
  configurableConstants: {
    BRIDGED_TOKEN_GATEWAY:
      '0x000000000000000000000000a4ca04d02bfdc3a2df56b9b6994520e69df43f67',
  },
  salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

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
    linkedData: { deployOpts: ASSET_ISSUER_DEPLOY_OPTS },
  });

  return true;
};

func.tags = ['set_asset_issuer'];
func.id = 'set_asset_issuer';
export default func;
