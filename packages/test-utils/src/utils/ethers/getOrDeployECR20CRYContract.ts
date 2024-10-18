import type { Token } from '@fuel-bridge/solidity-contracts/typechain';
import { CRY__factory, Token__factory } from '@fuel-bridge/solidity-contracts/typechain';

import { debug } from '../logs';
import type { TestEnvironment } from '../setup';


export async function getOrDeployECR20CRYContract(env: TestEnvironment) {
  debug('Setting up environment...');
  const ethDeployer = env.eth.signers[0];
  const ethDeployerAddr = await ethDeployer.getAddress();
  const ethAcct = env.eth.signers[0];

  // load ERC20 contract
  let ethCRYTestToken: Token = null;
  if (!ethCRYTestToken) {
    debug("Creating ERC-20 token contract to test with...");
    const eth_tokenFactory = new CRY__factory(ethDeployer);
    ethCRYTestToken = await eth_tokenFactory
      .deploy()
      .then((tx) => tx.waitForDeployment());
    debug(
      `Ethereum ERC-20 CRY token contract created at address ${await ethCRYTestToken.getAddress()}.`
    );
  }
  ethCRYTestToken = ethCRYTestToken.connect(ethAcct);
  const ethTestTokenAddress = await ethCRYTestToken.getAddress();
  debug(
    `Testing with Ethereum ERC-20 token contract at ${ethTestTokenAddress}.`
  );

  return ethCRYTestToken;
}
