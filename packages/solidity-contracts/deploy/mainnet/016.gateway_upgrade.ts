import { TransactionResponse } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelERC20GatewayV4__factory } from '../../typechain';
import { password } from '@inquirer/prompts';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { prepareUpgrade, upgradeProxy, erc1967 },
    deployments: { get, save },
  } = hre;

  const privateKey = await password({ message: 'Enter private key' });
  const deployer = new ethers.Wallet(privateKey, ethers.provider);

  const { address } = await get('FuelERC20GatewayV4');

  const factory = new FuelERC20GatewayV4__factory(deployer);
  const tx = (await prepareUpgrade(address, factory, {
    getTxResponse: true,
  })) as TransactionResponse;
  const receipt = await tx.wait();
  const implementation = receipt?.contractAddress!;

  console.log(`Proposed FuelERC20GatewayV4 upgrade to ${implementation}`);
  await save('FuelERC20GatewayV4', {
    address,
    abi: [...FuelERC20GatewayV4__factory.abi],
    implementation,
    linkedData: { factory: 'FuelERC20GatewayV4' },
  });

  return true;
};

func.tags = ['upgrade_gateway'];
func.id = 'upgrade_gateway';
export default func;
