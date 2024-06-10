import type { TestEnvironment } from '@fuel-bridge/test-utils';
import {
  setupEnvironment,
  fuels_parseEther,
  createRelayMessageParams,
  getMessageOutReceipt,
  waitForMessage,
  waitForBlockCommit,
  waitForBlockFinalization,
  getBlock,
  FUEL_CALL_TX_PARAMS,
} from '@fuel-bridge/test-utils';
import chai from 'chai';
import type { Signer } from 'ethers';
import { keccak256, parseEther, toUtf8Bytes } from 'ethers';
import { Address, bn, padFirst12BytesOfEvmAddress } from 'fuels';
import type {
  AbstractAddress,
  WalletUnlocked as FuelWallet,
  MessageProof,
  BN,
} from 'fuels';

const { expect } = chai;

describe.only('Forced Transaction Inclusion', async function () {
  // Timeout 6 minutes
  const DEFAULT_TIMEOUT_MS: number = 400_000;
  const FUEL_MESSAGE_TIMEOUT_MS: number = 30_000;
  let BASE_ASSET_ID: string;

  let env: TestEnvironment;

  // override the default test timeout of 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  before(async () => {
    env = await setupEnvironment({});
    BASE_ASSET_ID = env.fuel.provider.getBaseAssetId();
  });

  describe('Send a transaction through Ethereum', async () => {
    const NUM_ETH = '0.1';
    let ethSender: any;
    let fuelSender: FuelWallet;
    let fuelReceiver: FuelWallet;
    let fuelSignerBalance: BN;

    before(async () => {
      ethSender;
      fuelSender = env.fuel.deployer;
      fuelReceiver = env.fuel.signers[1];
      fuelSignerBalance = await fuelSender.getBalance(BASE_ASSET_ID);
    });

    it('Send ETH via OutputMessage', async () => {
      console.log('balance', fuelSignerBalance);

      const transferRequest = await fuelSender.createTransfer(
        fuelReceiver.address,
        fuelSignerBalance.div(10),
        BASE_ASSET_ID
      );
      const maxGas = transferRequest.calculateMaxGas(
        (await env.fuel.provider.fetchChainAndNodeInfo()).chain,
        bn(1)
      );
      console.log('maxGas', maxGas.toString());
      const serializedTx = transferRequest.toTransactionBytes();

      console.log('uhm', keccak256(toUtf8Bytes('GasLimit()')));

      console.log(await env.eth.fuelMessagePortal.GAS_LIMIT());

      await env.eth.fuelMessagePortal.sendTransaction(
        maxGas.toString(),
        serializedTx
      );

      //   // withdraw ETH back to the base chain
      //   const fWithdrawTx = await fuelSigner.withdrawToBaseLayer(
      //     Address.fromString(
      //       padFirst12BytesOfEvmAddress(ethereumETHReceiverAddress)
      //     ),
      //     fuels_parseEther(NUM_ETH),
      //     FUEL_CALL_TX_PARAMS
      //   );
      //   const fWithdrawTxResult = await fWithdrawTx.waitForResult();
      //   expect(fWithdrawTxResult.status).to.equal('success');

      //   // Wait for the commited block
      //   const withdrawBlock = await getBlock(
      //     env.fuel.provider.url,
      //     fWithdrawTxResult.blockId
      //   );
      //   const commitHashAtL1 = await waitForBlockCommit(
      //     env,
      //     withdrawBlock.header.height
      //   );

      //   // get message proof
      //   const messageOutReceipt = getMessageOutReceipt(
      //     fWithdrawTxResult.receipts
      //   );
      //   withdrawMessageProof = await fuelSigner.provider.getMessageProof(
      //     fWithdrawTx.id,
      //     messageOutReceipt.nonce,
      //     commitHashAtL1
      //   );

      //   // check that the sender balance has decreased by the expected amount
      //   const newSenderBalance = await fuelSigner.getBalance(BASE_ASSET_ID);

      //   // Get just the first 3 digits of the balance to compare to the expected balance
      //   // this is required because the payment of gas fees is not deterministic
      //   const diffOnSenderBalance = newSenderBalance
      //     .sub(fuelSignerBalance)
      //     .formatUnits();
      //   expect(diffOnSenderBalance.startsWith(NUM_ETH)).to.be.true;
    });
  });
});
