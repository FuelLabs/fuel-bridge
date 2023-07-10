import { TestEnvironment } from '../../setup';
import { Token } from '../../../fuel-v2-contracts/Token.d';
import { Token__factory } from '../../../fuel-v2-contracts/factories/Token__factory';
import { ethers_parseToken } from '../parsers';
import { debug } from '../logs';

const { ETH_ERC20_TOKEN_ADDRESS } = process.env;

export async function getOrDeployECR20Contract(env: TestEnvironment) {
  debug('Setting up environment...');
  const ethDeployer = env.eth.deployer;
  const ethDeployerAddr = await ethDeployer.getAddress();
  const ethAcct = env.eth.signers[1];

  // load ERC20 contract
  let ethTestToken: Token = null;
  if (ETH_ERC20_TOKEN_ADDRESS) {
    try {
      ethTestToken = Token__factory.connect(ETH_ERC20_TOKEN_ADDRESS, ethDeployer);
      const tokenOwner = await ethTestToken._owner();
      if (tokenOwner.toLowerCase() != ethDeployerAddr.toLowerCase()) {
        ethTestToken = null;
        debug(
          `The Ethereum ERC-20 token at ${ETH_ERC20_TOKEN_ADDRESS} is not owned by the Ethereum deployer ${ethDeployerAddr}.`
        );
      }
    } catch (e) {
      ethTestToken = null;
      debug(`The Ethereum ERC-20 token could not be found at the provided address ${ETH_ERC20_TOKEN_ADDRESS}.`);
    }
  }
  if (!ethTestToken) {
    debug(`Creating ERC-20 token contract to test with...`);
    const eth_tokenFactory = new Token__factory(ethDeployer);
    ethTestToken = await eth_tokenFactory.deploy();
    await ethTestToken.deployed();
    debug(`Ethereum ERC-20 token contract created at address ${ethTestToken.address}.`);
  }
  ethTestToken = ethTestToken.connect(ethAcct);
  const ethTestTokenAddress = ethTestToken.address;
  debug(`Testing with Ethereum ERC-20 token contract at ${ethTestTokenAddress}.`);

  return ethTestToken;
}

export async function mintECR20(env: TestEnvironment, ethTestToken: Token, ethAcctAddr: string, amount: string) {
  if ((await ethTestToken.balanceOf(ethAcctAddr)) <= ethers_parseToken(amount, 18).mul(2)) {
    debug(`Minting ERC-20 tokens to test with...`);
    const tokenMintTx1 = await ethTestToken.connect(env.eth.deployer).mint(ethAcctAddr, ethers_parseToken('100', 18));
    await tokenMintTx1.wait();
  }
}
