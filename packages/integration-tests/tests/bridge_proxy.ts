import type { TestEnvironment } from '@fuel-bridge/test-utils';
import {
  setupEnvironment,
  getOrDeployL2Bridge,
  FUEL_TX_PARAMS,
} from '@fuel-bridge/test-utils';
import chai from 'chai';
import type { Contract, FuelError } from 'fuels';

const { expect } = chai;

describe('Proxy', async function () {
  // override the default test timeout from 2000ms
  const DEFAULT_TIMEOUT_MS: number = 400_000;
  this.timeout(DEFAULT_TIMEOUT_MS);

  let env: TestEnvironment;
  let fuel_bridgeImpl: Contract;
  let fuel_proxy: Contract;

  before(async () => {
    env = await setupEnvironment({});

    const { proxy, implementation } = await getOrDeployL2Bridge(
      env,
      env.eth.fuelERC20Gateway,
      FUEL_TX_PARAMS
    );

    fuel_proxy = proxy;
    fuel_bridgeImpl = implementation;
  });

  describe('_proxy_owner()', () => {
    it('correctly initializes the proxy owner', async () => {
      const { value } = await fuel_proxy.functions._proxy_owner().dryRun();
      expect(value).to.have.property('Initialized');
      expect(value.Initialized.Address.bits).to.be.equal(
        env.fuel.deployer.address.toHexString()
      );
    });
  });

  describe('_proxy_change_owner()', () => {
    it('rejects unauthorized calls', async () => {
      const mallory = env.fuel.signers[0];
      fuel_proxy.account = mallory;

      const addressInput = { bits: mallory.address.toB256() };
      const addressIdentityInput = { Address: addressInput };

      const tx = fuel_proxy.functions
        ._proxy_change_owner(addressIdentityInput)
        .call();
      const [txResult] = await Promise.allSettled([tx]);

      if (txResult.status === 'fulfilled') {
        throw new Error('Transaction did not revert');
      }
      const { message } = txResult.reason as FuelError;

      expect(message).contains('NotOwner');
    });

    it('changes the owner', async () => {
      const oldOwner = env.fuel.deployer;
      const newOwner = env.fuel.signers[0];

      {
        fuel_proxy.account = oldOwner;
        const addressInput = { bits: newOwner.address.toB256() };
        const addressIdentityInput = { Address: addressInput };
        const tx = await fuel_proxy.functions
          ._proxy_change_owner(addressIdentityInput)
          .call();
        const result = await tx.transactionResponse.waitForResult();
        expect(result.status).to.equal('success');

        const { value } = await fuel_proxy.functions._proxy_owner().dryRun();
        expect(value).to.have.property('Initialized');
        expect(value.Initialized.Address.bits).to.be.equal(
          newOwner.address.toHexString()
        );
      }

      {
        fuel_proxy.account = newOwner;
        const addressInput = { bits: oldOwner.address.toB256() };
        const addressIdentityInput = { Address: addressInput };
        const tx = await fuel_proxy.functions
          ._proxy_change_owner(addressIdentityInput)
          .call();
        const result = await tx.transactionResponse.waitForResult();
        expect(result.status).to.equal('success');

        const { value } = await fuel_proxy.functions._proxy_owner().dryRun();
        expect(value).to.have.property('Initialized');
        expect(value.Initialized.Address.bits).to.be.equal(
          oldOwner.address.toHexString()
        );
      }
    });
  });

  describe('_proxy_target()', () => {
    it('correctly initializes the proxy target', async () => {
      fuel_proxy.account = env.fuel.deployer;
      const { value } = await fuel_proxy.functions._proxy_target().dryRun();
      expect(value.bits).to.be.equal(fuel_bridgeImpl.id.toHexString());
    });
  });

  describe('set_proxy_target', () => {
    const contractId =
      '0x7296ff960b5eb86b5f79aa587d7ebe1bae147c7cac046a16d062fbd7f3a753ec';
    const contractIdentityInput = { bits: contractId.toString() };

    it('rejects unauthorized calls', async () => {
      const mallory = env.fuel.signers[0];
      fuel_proxy.account = mallory;

      const tx = fuel_proxy.functions
        .set_proxy_target(contractIdentityInput)
        .call();
      const [txResult] = await Promise.allSettled([tx]);

      if (txResult.status === 'fulfilled') {
        throw new Error('Transaction did not revert');
      }
      const { message } = txResult.reason as FuelError;

      expect(message).contains('NotOwner');
    });

    it('correctly changes the target', async () => {
      fuel_proxy.account = env.fuel.deployer;

      const tx = await fuel_proxy.functions
        .set_proxy_target(contractIdentityInput)
        .call();
      const result = await tx.transactionResponse.waitForResult();
      expect(result.status).to.equal('success');

      const { value } = await fuel_proxy.functions._proxy_target().dryRun();
      expect(value.bits).to.be.equal(contractId);
    });
  });
});
