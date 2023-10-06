import { hexZeroPad } from '@ethersproject/bytes';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { constants, type ContractFactory } from 'ethers';
import hre from 'hardhat';

import { randomAddress, randomBytes32 } from '../protocol/utils';
import { FuelERC721GatewayV2__factory } from '../typechain';
import type {
  FuelERC721GatewayV2,
  MockFuelMessagePortal,
  NFT,
} from '../typechain';

import { impersonateAccount } from './utils/impersonateAccount';

type Env = {
  fuelMessagePortal: MockFuelMessagePortal;
  erc721Gateway: FuelERC721GatewayV2;
  V2Implementation: ContractFactory;
  nft: NFT;
  signers: SignerWithAddress[];
  deployer: SignerWithAddress;
};

describe('erc721GatewayV2', () => {
  const fixture = async () => {
    const signers = await hre.ethers.getSigners();
    const [deployer] = signers;

    const initializer = 'initialize';
    const fuelMessagePortal = await hre.ethers
      .getContractFactory('MockFuelMessagePortal')
      .then((factory) => factory.deploy() as Promise<MockFuelMessagePortal>);
    const erc721Gateway = await hre.ethers
      .getContractFactory('FuelERC721Gateway')
      .then((factory) =>
        hre.upgrades.deployProxy(factory, [fuelMessagePortal.address], {
          initializer,
        })
      )
      .then(({ address }) =>
        FuelERC721GatewayV2__factory.connect(address, deployer)
      );

    const nft = await hre.ethers
      .getContractFactory('NFT')
      .then((factory) => factory.deploy() as Promise<NFT>);

    const V2Implementation = await hre.ethers.getContractFactory(
      'FuelERC721GatewayV2'
    );

    return {
      fuelMessagePortal,
      erc721Gateway,
      V2Implementation,
      nft,
      signers,
      deployer,
    };
  };

  let env: Env;

  before('fixture', async () => {
    env = await fixture();
  });

  it('can upgrade from V1', async () => {
    const { erc721Gateway, V2Implementation } = env;

    await expect(erc721Gateway.isBridge(randomBytes32(), randomAddress())).to.be
      .reverted;

    await hre.upgrades.upgradeProxy(erc721Gateway, V2Implementation);

    // Check functions that only exist in v2
    expect(
      await erc721Gateway.isBridge(randomBytes32(), randomAddress())
    ).to.be.equal(false);
  });

  describe('deposit()', () => {
    it('reverts if target fuel bridge has not been initialized', async () => {
      const { nft, signers, erc721Gateway } = env;

      const [, user] = signers;
      const { HashZero, MaxUint256 } = constants;

      const depositTx = erc721Gateway
        .connect(user)
        .deposit(HashZero, nft.address, HashZero, MaxUint256);

      await expect(depositTx).to.be.revertedWithCustomError(
        erc721Gateway,
        'FuelContractIsNotBridge'
      );
    });

    it('works if target fuel bridge has been initialized', async () => {
      const { nft, signers, erc721Gateway, fuelMessagePortal } = env;
      const [, user] = signers;

      const tokenId = randomBytes32();
      await nft.mint(user.address, tokenId);
      await nft.connect(user).approve(erc721Gateway.address, tokenId);

      const fuelBridge = randomBytes32();
      const fuelRecipient = randomBytes32();
      const sender = hexZeroPad(user.address.toLowerCase(), 32);

      await fuelMessagePortal.setMessageSender(fuelBridge);
      const impersonatedPortal = await impersonateAccount(
        fuelMessagePortal.address,
        hre
      );

      const registerTx = await erc721Gateway
        .connect(impersonatedPortal)
        .registerAsReceiver(nft.address);

      await expect(registerTx).to.emit(erc721Gateway, 'ReceiverRegistered');

      const depositTx = await erc721Gateway
        .connect(user)
        .deposit(fuelRecipient, nft.address, fuelBridge, tokenId);

      await expect(depositTx)
        .to.emit(erc721Gateway, 'Deposit')
        .withArgs(sender, nft.address, fuelBridge, tokenId);
    });
  });
});
