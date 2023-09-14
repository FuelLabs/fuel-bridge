import type { TestEnvironment } from '@fuel-bridge/test-utils';
import { setupEnvironment } from '@fuel-bridge/test-utils';
import { Address, bn } from 'fuels';

(async function () {
  const env: TestEnvironment = await setupEnvironment({});
  const fuelAccount = env.fuel.signers[0];

  const resp = await fuelAccount.transfer(
    Address.fromString(
      'fuel18e7amfxs60urq7h97xhdsa3rnykpcn0valkxsjfkjcrh2xqmyvpq4ay9jn'
    ),
    bn.parseUnits('0.1')
  );
  await resp.waitForResult();
})();
