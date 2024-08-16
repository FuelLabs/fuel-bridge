import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

const ASSET_ISSUER_PROXY_ID =
  '0xa10f53918370e471393e4936940eddb05fb189ed62ad662cc4025e2bf638da86';

const ASSET_ISSUER_IMPL_ID =
  '0x28511a19b9f7b4e2e54ed70233fdeae603770618196c8e84f37b4f7d377af9f4';

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
