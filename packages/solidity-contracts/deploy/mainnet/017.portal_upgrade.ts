import { TransactionResponse, parseEther } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';

import { FuelMessagePortalV3__factory as FuelMessagePortal } from '../../typechain';
import { password } from '@inquirer/prompts';

const RATE_LIMIT_DURATION = 3600 * 24 * 7;

// Global deposit cap: 19572 ETH
const ETH_DEPOSIT_CAP = parseEther('19572');

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    ethers,
    upgrades: { prepareUpgrade },
    deployments: { get, save },
  } = hre;

  const privateKey = await password({ message: 'Enter private key' });
  const deployer = new ethers.Wallet(privateKey, ethers.provider);

  const { address } = await get('FuelMessagePortal');

  const constructorArgs = [ETH_DEPOSIT_CAP.toString(), RATE_LIMIT_DURATION];

  const tx = (await prepareUpgrade(address, new FuelMessagePortal(deployer), {
    constructorArgs,
    getTxResponse: true,
  })) as TransactionResponse;
  const receipt = await tx.wait();

  const implementation = receipt?.contractAddress!;

  console.log('Proposed FuelMessagePortal upgrade to', implementation);
  await save('FuelMessagePortal', {
    address,
    abi: [...FuelMessagePortal.abi],
    implementation,
    linkedData: { factory: 'FuelMessagePortalV3', constructorArgs },
  });

  return true;
};

func.tags = ['upgrade_portal'];
func.id = 'upgrade_portal';
export default func;
