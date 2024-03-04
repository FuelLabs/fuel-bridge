import type { NFT } from '@fuel-bridge/solidity-contracts/typechain';
import { NFT__factory } from '@fuel-bridge/solidity-contracts/typechain';

import { debug } from '../logs';
import type { TestEnvironment } from '../setup';

export async function getOrDeployERC721Contract(env: TestEnvironment) {
  debug('Setting up environment...');
  const ethDeployer = env.eth.signers[0];
  debug(`Creating ERC-721 token contract to test with...`);
  const eth_tokenFactory = new NFT__factory(ethDeployer);
  let ethTestNft = await eth_tokenFactory
    .deploy()
    .then((tx) => tx.waitForDeployment());
  const ethTestNftAddress = await ethTestNft.getAddress();

  debug(
    `Ethereum ERC-721 token contract created at address ${ethTestNftAddress}.`
  );

  ethTestNft = ethTestNft.connect(ethDeployer);
  debug(
    `Testing with Ethereum ERC-721 token contract at ${ethTestNftAddress}.`
  );

  return ethTestNft;
}

export async function mintERC721(
  env: TestEnvironment,
  ethTestNft: NFT,
  ethAcctAddr: string,
  tokenId: string
) {
  const tokenExists = await ethTestNft
    .ownerOf(tokenId) // Call should revert if the tokenId does not exists
    .then(() => true)
    .catch(() => false);

  if (tokenExists) {
    debug(`tokenId ${tokenId} already exists, skipping mint`);
    return;
  }

  debug(`Minting ERC-721 token ${tokenId} to test with...`);
  await ethTestNft
    .connect(env.eth.deployer)
    .mint(ethAcctAddr, tokenId)
    .then((tx) => tx.wait());
}
