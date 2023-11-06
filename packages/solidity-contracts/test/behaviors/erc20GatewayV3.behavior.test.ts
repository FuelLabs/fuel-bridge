import { hexZeroPad } from '@ethersproject/bytes';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { constants, type ContractFactory } from 'ethers';
import hre from 'hardhat';

import { randomAddress, randomBytes32 } from '../../protocol/utils';
import {
  type MockFuelMessagePortal,
  type FuelERC20GatewayV3,
  type Token,
  FuelERC20GatewayV3__factory,
} from '../../typechain';
import { impersonateAccount } from '../utils/impersonateAccount';

type Env = {
  fuelMessagePortal: MockFuelMessagePortal;
  erc20Gateway: FuelERC20GatewayV3;
  V2Implementation: ContractFactory;
  token: Token;
  signers: SignerWithAddress[];
  deployer: SignerWithAddress;
};

export function behavesLikeErc20GatewayV3(fixture: () => Promise<Env>) {
  describe('Behaves like FuelERC20GatewayV3', () => {
    let env: Env;

    before('fixture', async () => {
      env = await fixture();
    });

    it('can upgrade from V2', async () => {
      const [deployer] = await hre.ethers.getSigners();
      const fuelMessagePortal = randomAddress();

      const erc20Gateway = await hre.ethers
        .getContractFactory('FuelERC20GatewayV2')
        .then((factory) =>
          hre.upgrades.deployProxy(factory, [fuelMessagePortal], {
            initializer: 'initialize',
          })
        )
        .then(({ address }) =>
          FuelERC20GatewayV3__factory.connect(address, deployer)
        );

      // Check that functions that only exist on V3 do revert
      await expect(erc20Gateway.depositLimitGlobal(randomAddress())).to.be
        .reverted;

      const V3Implementation = await hre.ethers.getContractFactory(
        'FuelERC20GatewayV3'
      );
      await hre.upgrades.upgradeProxy(erc20Gateway, V3Implementation);

      // Check functions that exist in v3 now do return a value
      expect(
        await erc20Gateway.depositLimitGlobal(randomAddress())
      ).to.be.equal(0);
    });

    describe('deposit()', () => {
      it('works if deposited amount is equal the global limit');
      it('works if deposited amount is equal to the account limit');
      it('reverts if deposited amount is over the global limit');
      it('reverts if deposited amount is over the account limit');
      it('reverts if deposited amount is 0');
    });

    describe('finalizeWithdrawal', () => {
      it('reduces the deposited balances');
      it('nullifies the deposited address');
      it('reverts if withdrawn amount is 0');
      it('reverts if tokenId is not 0');
    });
  });
}
