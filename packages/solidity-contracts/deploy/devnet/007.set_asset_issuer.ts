import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC20GatewayV4__factory } from '../../typechain';

const ASSET_ISSUER_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre;
  const [deployer] = await ethers.getSigners();

  const { address } = await deployments.get('FuelERC20GatewayV4');

  const gateway = FuelERC20GatewayV4__factory.connect(address, deployer);

  console.log('Setting asset issuer ID to', ASSET_ISSUER_ID);
  await gateway.setAssetIssuerId(ASSET_ISSUER_ID).then((tx) => tx.wait());
  console.log('Finished');

  return true;
};

func.tags = ['asset_issuer', 'AssetIssuer'];
func.id = 'set_asset_issuer_id';
export default func;
