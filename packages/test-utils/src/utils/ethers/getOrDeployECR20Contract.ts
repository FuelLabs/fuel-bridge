import type { Token } from '@fuel-bridge/solidity-contracts/typechain';
import { Token__factory } from '@fuel-bridge/solidity-contracts/typechain';

import { debug } from '../logs';
import { ethers_parseToken } from '../parsers';
import type { TestEnvironment } from '../setup';

const { ETH_ERC20_TOKEN_ADDRESS } = process.env;

export async function getOrDeployECR20Contract(env: TestEnvironment) {
  debug('Setting up environment...');
  const ethDeployer = env.eth.signers[0];
  const ethDeployerAddr = await ethDeployer.getAddress();
  const ethAcct = env.eth.signers[0];

  // load ERC20 contract
  let ethTestToken: Token = null;
  if (ETH_ERC20_TOKEN_ADDRESS) {
    try {
      ethTestToken = Token__factory.connect(
        ETH_ERC20_TOKEN_ADDRESS,
        ethDeployer
      );
      const tokenOwner = await ethTestToken._owner();
      if (tokenOwner.toLowerCase() != ethDeployerAddr.toLowerCase()) {
        ethTestToken = null;
        debug(
          `The Ethereum ERC-20 token at ${ETH_ERC20_TOKEN_ADDRESS} is not owned by the Ethereum deployer ${ethDeployerAddr}.`
        );
      }
    } catch (e) {
      ethTestToken = null;
      debug(
        `The Ethereum ERC-20 token could not be found at the provided address ${ETH_ERC20_TOKEN_ADDRESS}.`
      );
    }
  }
  if (!ethTestToken) {
    debug(`Creating ERC-20 token contract to test with...`);
    const eth_tokenFactory = new Token__factory(ethDeployer);
    ethTestToken = await eth_tokenFactory
      .deploy()
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

export async function mintECR20(
  env: TestEnvironment,
  ethTestToken: Token,
  ethAcctAddr: string,
  amount: string
) {
  if (
    (await ethTestToken.balanceOf(ethAcctAddr)) <=
    ethers_parseToken(amount, 18n) * 2n
  ) {
    debug(`Minting ERC-20 tokens to test with...`);
    const tokenMintTx1 = await ethTestToken
      .connect(env.eth.deployer)
      .mint(ethAcctAddr, ethers_parseToken('100', 18n));
    await tokenMintTx1.wait();
  }
}
