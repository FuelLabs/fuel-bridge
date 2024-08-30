import type { CustomToken } from '@fuel-bridge/solidity-contracts/typechain';
import { CustomToken__factory } from '@fuel-bridge/solidity-contracts/typechain';

import { debug } from '../logs';
import { ethers_parseToken } from '../parsers';
import type { TestEnvironment } from '../setup';

const { ETH_ERC20_TOKEN_ADDRESS } = process.env;

export async function getOrDeployCustomTokenContract(
  env: TestEnvironment,
  decimals: bigint
) {
  debug('Setting up environment...');
  const ethDeployer = env.eth.signers[0];
  const ethAcct = env.eth.signers[0];

  // load ERC20 contract
  let ethTestToken: CustomToken = null;
  if (ETH_ERC20_TOKEN_ADDRESS) {
    try {
      ethTestToken = CustomToken__factory.connect(
        ETH_ERC20_TOKEN_ADDRESS,
        ethDeployer
      );
    } catch (e) {
      ethTestToken = null;
      debug(
        `The Ethereum ERC-20 token could not be found at the provided address ${ETH_ERC20_TOKEN_ADDRESS}.`
      );
    }
  }
  if (!ethTestToken) {
    debug(`Creating ERC-20 token contract to test with...`);
    const eth_tokenFactory = new CustomToken__factory(ethDeployer);
    ethTestToken = await eth_tokenFactory
      .deploy(decimals)
      .then((tx) => tx.waitForDeployment());
    debug(
      `Ethereum ERC-20 token contract created at address ${await ethTestToken.getAddress()}.`
    );
  }
  ethTestToken = ethTestToken.connect(ethAcct);
  const ethTestTokenAddress = await ethTestToken.getAddress();
  debug(
    `Testing with Ethereum ERC-20 token contract at ${ethTestTokenAddress}.`
  );

  return ethTestToken;
}

export async function mintToken(
  env: TestEnvironment,
  ethTestToken: CustomToken,
  ethAcctAddr: string,
  amount: string,
  decimals: bigint
) {
  if (
    (await ethTestToken.balanceOf(ethAcctAddr)) <=
    ethers_parseToken(amount, decimals) * 2n
  ) {
    debug(`Minting ERC-20 tokens to test with...`);
    const tokenMintTx1 = await ethTestToken
      .connect(env.eth.deployer)
      .mint(ethAcctAddr, ethers_parseToken('100', decimals));
    await tokenMintTx1.wait();
  }
}
