import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

// This is a bit of a magic value, that comes from deploying the L2 bridge
// The parameters that influence in this contract ID are:
// - The sway compiler version used to compile the L2 proxy and bridge contract
// - The initial configurables used in the deployment of the L2 bridge:
//  * Token gateway address: expected to be at
//      `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707`
//  * Owner of the proxy, the default local testnet fuel signer:
//      public addr: `0x6b63804cfbf9856e68e5b6e7aef238dc8311ec55bec04df774003a2c96e0418e`
//      private key: `0xde97d8624a438121b86a1956544bd72ed68cd69f2c99555b08b1e8c51ffd511c`
const ASSET_ISSUER_ID =
  process.env.ASSET_ISSUER_ID ||
  '0x5434af870bc7f3b589719c737a82c67c8a562bea28bba0db82e7a22a8a1f7e87';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;
  const [deployer] = await ethers.getSigners();

  await deployments.execute(
    'FuelERC20Gateway',
    { log: true, from: deployer.address },
    'setAssetIssuerId',
    ASSET_ISSUER_ID
  );

  await deployments.save('FuelL2BridgeId', {
    address: ASSET_ISSUER_ID,
    abi: [],
  });
};

func.tags = ['set_asset_issuer_id'];
func.id = 'set_asset_issuer_id';
export default func;
