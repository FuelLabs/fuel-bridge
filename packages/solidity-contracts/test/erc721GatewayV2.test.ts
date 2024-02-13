import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import {
  ZeroHash,
  type ContractFactory,
  MaxUint256,
  zeroPadValue,
} from 'ethers';
import hre from 'hardhat';

import { randomAddress, randomBytes32 } from '../protocol/utils';
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
  signers: HardhatEthersSigner[];
  deployer: HardhatEthersSigner;
};

describe('erc721GatewayV2', () => {
  const fixture = async () => {
    const signers = await hre.ethers.getSigners();
    const [deployer] = signers;

    const initializer = 'initialize';
    const fuelMessagePortal = await hre.ethers
      .getContractFactory('MockFuelMessagePortal')
      .then(
        async (factory) => factory.deploy() as Promise<MockFuelMessagePortal>
      );
    const erc721GatewayDeployment = await hre.ethers
      .getContractFactory('FuelERC721Gateway')
      .then(async (factory) =>
        hre.upgrades.deployProxy(
          factory,
          [await fuelMessagePortal.getAddress()],
          {
            initializer,
          }
        )
      )
      .then((tx) => tx.waitForDeployment());

    const nft = await hre.ethers
      .getContractFactory('NFT')
      .then(async (factory) => factory.deploy() as Promise<NFT>);

    const V2Implementation = await hre.ethers.getContractFactory(
      'FuelERC721GatewayV2'
    );

    const erc721Gateway = V2Implementation.attach(
      await erc721GatewayDeployment.getAddress()
    ).connect(erc721GatewayDeployment.runner) as FuelERC721GatewayV2;

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

      const depositTx = erc721Gateway
        .connect(user)
        .deposit(ZeroHash, await nft.getAddress(), ZeroHash, MaxUint256);

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
      await nft.connect(user).approve(erc721Gateway, tokenId);

      const fuelBridge = randomBytes32();
      const fuelRecipient = randomBytes32();
      const sender = zeroPadValue(user.address.toLowerCase(), 32);

      await fuelMessagePortal.setMessageSender(fuelBridge);
      const impersonatedPortal = await impersonateAccount(
        await fuelMessagePortal.getAddress(),
        hre
      );

      const registerTx = await erc721Gateway
        .connect(impersonatedPortal)
        .registerAsReceiver(await nft.getAddress());

      await expect(registerTx).to.emit(erc721Gateway, 'ReceiverRegistered');

      const depositTx = await erc721Gateway
        .connect(user)
        .deposit(fuelRecipient, await nft.getAddress(), fuelBridge, tokenId);

      await expect(depositTx)
        .to.emit(erc721Gateway, 'Deposit')
        .withArgs(sender, await nft.getAddress(), fuelBridge, tokenId);
    });
  });
});
