import type { TestEnvironment } from '@fuel-bridge/test-utils';
import {
  setupEnvironment,
  logETHBalances,
  waitForMessage,
  FUEL_MESSAGE_TIMEOUT_MS,
} from '@fuel-bridge/test-utils';
import { parseEther } from 'ethers';
import {
  Address,
  BN,
} from 'fuels';

const ETH_AMOUNT = '0.1';

// This script is a demonstration of how the base asset (ETH) is bridged to and from the Fuel chain
(async function depositETH() {
  // basic setup routine which creates the connections (the "providers") to both chains,
  // funds addresses for us to test with and populates the official contract deployments
  // on the Ethereum chain for interacting with the Fuel chain
  console.log('Setting up environment...');
  console.log('');
  const timeoutCheck = FUEL_MESSAGE_TIMEOUT_MS * 5;
  const env: TestEnvironment = await setupEnvironment({
    skip_deployer_balance: true,
  });
  const ethereumAccount = env.eth.signers[0];
  const fuelAccount = env.fuel.signers[0];
  const fuelAccountAddress = fuelAccount.address.toHexString();
  const fuelMessagePortal = env.eth.fuelMessagePortal.connect(ethereumAccount);

  /////////////////////////////
  // Bridge Ethereum -> Fuel //
  /////////////////////////////

  // note balances of both accounts before transfer
  await logETHBalances(ethereumAccount, fuelAccount);

  // use the FuelMessagePortal to directly send ETH to the fuel account
  console.log(`Sending ${ETH_AMOUNT} ETH from Ethereum...`);
  const eSendTx = await fuelMessagePortal.depositETH(fuelAccountAddress, {
    value: parseEther(ETH_AMOUNT),
  });
  const eSendTxResult = await eSendTx.wait();
  if (eSendTxResult.status !== 1) {
    console.log(eSendTxResult);
    throw new Error('failed to call depositETH');
  }

  // parse events from logs to get the message nonce
  const event = fuelMessagePortal.interface.parseLog(eSendTxResult.logs[0]);
  const depositMessageNonce = new BN(event.args.nonce.toString());
  const depositRecipient = Address.fromB256(event.args.recipient);

  // wait for message to appear in fuel client
  console.log('Waiting for ETH to arrive on Fuel...');
  const depositMessage = await waitForMessage(
    env.fuel.provider,
    depositRecipient,
    depositMessageNonce,
    timeoutCheck
  );
  if (depositMessage == null) {
    throw new Error(
        `message took longer than ${timeoutCheck}ms to arrive on Fuel`
    );
  }
  console.log('');

  // the sent ETH is now spendable on Fuel
  console.log('ETH was bridged to Fuel successfully!!');

  // note balances of both accounts after transfer
  await logETHBalances(ethereumAccount, fuelAccount);
})();
