import type { TestEnvironment } from '@fuel-bridge/test-utils';
import { setupEnvironment, waitForTransaction } from '@fuel-bridge/test-utils';
import chai from 'chai';
import { hexlify, solidityPacked } from 'ethers';
import { sha256, transactionRequestify } from 'fuels';
import type { WalletUnlocked as FuelWallet, BN } from 'fuels';

const { expect } = chai;

const MAX_GAS = 10000000n;

describe('Forced Transaction Inclusion', async function () {
  // Timeout 6 minutes
  const DEFAULT_TIMEOUT_MS: number = 400_000;
  let BASE_ASSET_ID: string;
  let CHAIN_ID: number;

  let env: TestEnvironment;

  // override the default test timeout of 2000ms
  this.timeout(DEFAULT_TIMEOUT_MS);

  before(async () => {
    env = await setupEnvironment({});
    BASE_ASSET_ID = env.fuel.provider.getBaseAssetId();
    CHAIN_ID = env.fuel.provider.getChainId();
  });

  describe('Send a transaction through Ethereum', async () => {
    const NUM_ETH = '0.1';
    let ethSender: any;
    let fuelSender: FuelWallet;
    let fuelReceiver: FuelWallet;
    let fuelSenderBalance: BN;
    let fuelReceiverBalance: BN;

    before(async () => {
      ethSender;
      fuelSender = env.fuel.deployer;
      fuelReceiver = env.fuel.signers[1];
      fuelSenderBalance = await fuelSender.getBalance(BASE_ASSET_ID);
      fuelReceiverBalance = await fuelReceiver.getBalance(BASE_ASSET_ID);
    });

    it('allows to send transactions', async () => {
      const transferRequest = await fuelSender.createTransfer(
        fuelReceiver.address,
        fuelSenderBalance.div(10),
        BASE_ASSET_ID
      );

      const transactionRequest = transactionRequestify(transferRequest);
      await env.fuel.provider.estimateTxDependencies(transactionRequest);

      const signature = await fuelSender.signTransaction(transactionRequest);
      transactionRequest.updateWitnessByOwner(fuelSender.address, signature);

      const fuelSerializedTx = hexlify(transactionRequest.toTransactionBytes());

      const gasPrice = await env.eth.fuelMessagePortal.MIN_GAS_PRICE();
      const expectedFee = gasPrice * MAX_GAS;

      const ethTx = await env.eth.fuelMessagePortal.sendTransaction(
        MAX_GAS,
        fuelSerializedTx,
        { value: expectedFee }
      );

      const { blockNumber } = await ethTx.wait();

      const [event] = await env.eth.fuelMessagePortal.queryFilter(
        env.eth.fuelMessagePortal.filters.Transaction,
        blockNumber,
        blockNumber
      );

      expect(event.args.canonically_serialized_tx).to.be.equal(
        fuelSerializedTx
      );

      const payload = solidityPacked(
        ['uint256', 'uint64', 'bytes'],
        [
          event.args.nonce,
          event.args.max_gas,
          event.args.canonically_serialized_tx,
        ]
      );
      const relayedTxId = sha256(payload);
      const fuelTxId = transactionRequest.getTransactionId(CHAIN_ID);

      const { response, error } = await waitForTransaction(
        fuelTxId,
        env.fuel.provider,
        {
          relayedTxId,
        }
      );

      if (error) {
        throw new Error(error);
      }

      const txResult = await response.waitForResult();

      expect(txResult.status).to.equal('success');
    });

    it('rejects transactions without signatures', async () => {
      const transferRequest = await fuelSender.createTransfer(
        fuelReceiver.address,
        fuelSenderBalance.div(10),
        BASE_ASSET_ID
      );

      const transactionRequest = transactionRequestify(transferRequest);
      await env.fuel.provider.estimateTxDependencies(transactionRequest);

      const fuelSerializedTx = hexlify(transactionRequest.toTransactionBytes());

      const gasPrice = await env.eth.fuelMessagePortal.MIN_GAS_PRICE();
      const expectedFee = gasPrice * MAX_GAS;

      const ethTx = await env.eth.fuelMessagePortal.sendTransaction(
        MAX_GAS,
        fuelSerializedTx,
        { value: expectedFee }
      );

      const { blockNumber } = await ethTx.wait();

      const [event] = await env.eth.fuelMessagePortal.queryFilter(
        env.eth.fuelMessagePortal.filters.Transaction,
        blockNumber,
        blockNumber
      );

      expect(event.args.canonically_serialized_tx).to.be.equal(
        fuelSerializedTx
      );

      const payload = solidityPacked(
        ['uint256', 'uint64', 'bytes'],
        [
          event.args.nonce,
          event.args.max_gas,
          event.args.canonically_serialized_tx,
        ]
      );
      const relayedTxId = sha256(payload);
      const fuelTxId = transactionRequest.getTransactionId(CHAIN_ID);

      const { response, error } = await waitForTransaction(
        fuelTxId,
        env.fuel.provider,
        {
          relayedTxId,
        }
      );

      expect(response).to.be.null;
      expect(error).to.contain('InvalidSignature');
    });

    it('rejects transactions without enough gas', async () => {
      const transferRequest = await fuelSender.createTransfer(
        fuelReceiver.address,
        fuelSenderBalance.div(10),
        BASE_ASSET_ID
      );

      const transactionRequest = transactionRequestify(transferRequest);
      await env.fuel.provider.estimateTxDependencies(transactionRequest);

      const signature = await fuelSender.signTransaction(transactionRequest);
      transactionRequest.updateWitnessByOwner(fuelSender.address, signature);

      const fuelSerializedTx = hexlify(transactionRequest.toTransactionBytes());

      const gasPrice = await env.eth.fuelMessagePortal.MIN_GAS_PRICE();
      const minGasPerTx = await env.eth.fuelMessagePortal.MIN_GAS_PER_TX();
      const expectedFee = gasPrice * minGasPerTx;

      const ethTx = await env.eth.fuelMessagePortal.sendTransaction(
        minGasPerTx,
        fuelSerializedTx,
        { value: expectedFee }
      );

      const { blockNumber } = await ethTx.wait();

      const [event] = await env.eth.fuelMessagePortal.queryFilter(
        env.eth.fuelMessagePortal.filters.Transaction,
        blockNumber,
        blockNumber
      );

      expect(event.args.canonically_serialized_tx).to.be.equal(
        fuelSerializedTx
      );

      const payload = solidityPacked(
        ['uint256', 'uint64', 'bytes'],
        [
          event.args.nonce,
          event.args.max_gas,
          event.args.canonically_serialized_tx,
        ]
      );
      const relayedTxId = sha256(payload);
      const fuelTxId = transactionRequest.getTransactionId(CHAIN_ID);

      const { response, error } = await waitForTransaction(
        fuelTxId,
        env.fuel.provider,
        {
          relayedTxId,
        }
      );

      expect(response).to.be.null;
      expect(error).to.contain('Insufficient');
    });
  });
});
