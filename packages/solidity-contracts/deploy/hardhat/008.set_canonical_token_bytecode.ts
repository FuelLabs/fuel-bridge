import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/dist/types';
import {
  USDT_ADDRESS,
  USDC_ADDRESS,
  WBTC_ADDRESS,
  WETH_ADDRESS,
} from '../../protocol/constants';
import { CustomToken__factory } from '../../typechain';

// script used to set custom token contract bytecodes for mainnet token addresses for testing purposes[USDC, USDT, WBTC, WETH]
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  const customTokenFactory = await ethers.getContractFactory(
    'CustomToken',
    deployer
  );
  const customTokenWETHFactory = await ethers.getContractFactory(
    'CustomTokenWETH',
    deployer
  );

  let customToken = await customTokenFactory.deploy();
  await customToken.waitForDeployment();

  let runtimeBytecode = await ethers.provider.getCode(
    await customToken.getAddress()
  );

  await ethers.provider.send('hardhat_setCode', [
    USDT_ADDRESS,
    runtimeBytecode,
  ]);

  let tokenInstance = CustomToken__factory.connect(USDT_ADDRESS, deployer);
  await tokenInstance.setDecimals(6n);

  customToken = await customTokenFactory.deploy();
  await customToken.waitForDeployment();

  runtimeBytecode = await ethers.provider.getCode(
    await customToken.getAddress()
  );

  await ethers.provider.send('hardhat_setCode', [
    USDC_ADDRESS,
    runtimeBytecode,
  ]);

  tokenInstance = CustomToken__factory.connect(USDC_ADDRESS, deployer);
  await tokenInstance.setDecimals(6n);

  customToken = await customTokenFactory.deploy();
  await customToken.waitForDeployment();

  runtimeBytecode = await ethers.provider.getCode(
    await customToken.getAddress()
  );

  await ethers.provider.send('hardhat_setCode', [
    WBTC_ADDRESS,
    runtimeBytecode,
  ]);

  tokenInstance = CustomToken__factory.connect(WBTC_ADDRESS, deployer);
  await tokenInstance.setDecimals(8n);

  const customTokenWETH = await customTokenWETHFactory.deploy();
  await customTokenWETH.waitForDeployment();

  runtimeBytecode = await ethers.provider.getCode(
    await customTokenWETH.getAddress()
  );

  await ethers.provider.send('hardhat_setCode', [
    WETH_ADDRESS,
    runtimeBytecode,
  ]);
};

func.tags = ['set_canonical_token_bytecode'];
func.id = 'set_canonical_token_bytecode';
export default func;
