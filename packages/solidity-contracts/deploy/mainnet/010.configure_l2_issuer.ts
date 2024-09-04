import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import { ZeroHash } from 'ethers';

const ASSET_ISSUER_PROXY_ID = ZeroHash;
const ASSET_ISSUER_IMPL_ID = ZeroHash;

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
func.skip = async () => true; // This function is not enabled yet
export default func;
