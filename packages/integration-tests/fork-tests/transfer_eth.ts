// import type { TestEnvironment } from '@fuel-bridge/test-utils';
// import {
//   setupEnvironment,
//   fuels_parseEther,
//   createRelayMessageParams,
//   getMessageOutReceipt,
//   waitForMessage,
//   waitForBlockFinalization,
//   getBlock,
//   FUEL_CALL_TX_PARAMS,
// } from '@fuel-bridge/test-utils';
// import chai from 'chai';
// import { parseEther } from 'ethers';
// import type { Signer } from 'ethers';
// import { Address, BN, padFirst12BytesOfEvmAddress } from 'fuels';
// import type {
//   AbstractAddress,
//   WalletUnlocked as FuelWallet,
//   MessageProof,
//   Provider,
// } from 'fuels';

// import type { Containers } from '../docker-setup/docker';
// import { startContainers } from '../docker-setup/docker';

// const { expect } = chai;

// describe('Transferring ETH', async function () {
//   // Timeout 6 minutes
//   const DEFAULT_TIMEOUT_MS: number = 400_000;
//   const FUEL_MESSAGE_TIMEOUT_MS: number = 30_000;
//   let BASE_ASSET_ID: string;

//   let env: TestEnvironment;

//   let containers: Containers;

//   // override the default test timeout of 2000ms
//   this.timeout(DEFAULT_TIMEOUT_MS);

//   async function forwardFuelChain(provider: Provider, blocksToForward: string) {
//     await provider.produceBlocks(Number(blocksToForward)).catch(console.error);
//   }

//   async function generateWithdrawalMessageProof(
//     fuelETHSender: FuelWallet,
//     ethereumETHReceiverAddress: string,
//     NUM_ETH: string
//   ): Promise<MessageProof | null> {
//     // withdraw ETH back to the base chain
//     const fWithdrawTx = await fuelETHSender.withdrawToBaseLayer(
//       Address.fromString(
//         padFirst12BytesOfEvmAddress(ethereumETHReceiverAddress)
//       ),
//       fuels_parseEther(NUM_ETH),
//       FUEL_CALL_TX_PARAMS
//     );
//     const fWithdrawTxResult = await fWithdrawTx.waitForResult();
//     expect(fWithdrawTxResult.status).to.equal('success');

//     // Wait for the commited block
//     const withdrawBlock = await getBlock(
//       env.fuel.provider.url,
//       fWithdrawTxResult.blockId!
//     );

//     const TIME_TO_FINALIZE = await env.eth.fuelChainState.TIME_TO_FINALIZE();

//     const blocksPerCommitInterval = (
//       await env.eth.fuelChainState.BLOCKS_PER_COMMIT_INTERVAL()
//     ).toString();

//     // Add + 1 to the block height to wait the next block
//     // that enable to proof the message
//     const nextBlockHeight = new BN(withdrawBlock.header.height).add(new BN(1));
//     const commitHeight = new BN(nextBlockHeight).div(blocksPerCommitInterval);

//     const cooldown = await env.eth.fuelChainState.COMMIT_COOLDOWN();

//     // fast forward post the commit cooldown period
//     await env.eth.provider.send('evm_increaseTime', [Number(cooldown) * 10]);
//     await env.eth.provider.send('evm_mine', []); // Mine a new block

//     // produce more blocks to fetch the block height
//     await forwardFuelChain(env.fuel.provider, blocksPerCommitInterval);

//     const block = await env.fuel.provider.getBlock(nextBlockHeight.toString());

//     // reset the commit hash in the local L2 network
//     await env.eth.fuelChainState
//       .connect(env.eth.signers[1])
//       .commit(block.id, commitHeight.toString());

//     // fast forward to the block finalization time
//     await env.eth.provider.send('evm_increaseTime', [
//       Number(TIME_TO_FINALIZE) * 2,
//     ]);
//     await env.eth.provider.send('evm_mine', []); // Mine a new block

//     // get message proof
//     const messageOutReceipt = getMessageOutReceipt(fWithdrawTxResult.receipts);

//     return await fuelETHSender.provider.getMessageProof(
//       fWithdrawTx.id,
//       messageOutReceipt.nonce,
//       block.id
//     );
//   }

//   async function relayMessage(
//     env: TestEnvironment,
//     withdrawMessageProof: MessageProof
//   ) {
//     // wait for block finalization
//     await waitForBlockFinalization(env, withdrawMessageProof);

//     // construct relay message proof data
//     const relayMessageParams = createRelayMessageParams(withdrawMessageProof);

//     const TIME_TO_FINALIZE = await env.eth.fuelChainState.TIME_TO_FINALIZE();

//     // fast forward to the block finalization time
//     await env.eth.provider.send('evm_increaseTime', [
//       Number(TIME_TO_FINALIZE) * 100,
//     ]);
//     await env.eth.provider.send('evm_mine', []); // Mine a new block

//     // relay message
//     await env.eth.fuelMessagePortal.relayMessage(
//       relayMessageParams.message,
//       relayMessageParams.rootBlockHeader,
//       relayMessageParams.blockHeader,
//       relayMessageParams.blockInHistoryProof,
//       relayMessageParams.messageInBlockProof
//     );
//   }

//   before(async () => {
//     // spinning up all docker containers
//     containers = await startContainers(true);

//     env = await setupEnvironment({});
//     BASE_ASSET_ID = env.fuel.provider.getBaseAssetId();
//   });

//   describe('Send ETH to Fuel', async () => {
//     const NUM_ETH = '30';
//     let ethereumETHSender: Signer;
//     let ethereumETHSenderAddress: string;
//     let fuelETHReceiver: AbstractAddress;
//     let fuelETHReceiverAddress: string;
//     let fuelETHReceiverBalance: BN;
//     let fuelETHMessageNonce: BN;

//     before(async () => {
//       ethereumETHSender = env.eth.signers[0];
//       ethereumETHSenderAddress = await ethereumETHSender.getAddress();
//       fuelETHReceiver = env.fuel.signers[0].address;
//       fuelETHReceiverAddress = fuelETHReceiver.toHexString();

//       fuelETHReceiverBalance = await env.fuel.provider.getBalance(
//         fuelETHReceiver,
//         BASE_ASSET_ID
//       );
//     });

//     it('Send ETH via MessagePortal', async () => {
//       // use the FuelMessagePortal to directly send ETH which should be immediately spendable
//       const tx = await env.eth.fuelMessagePortal
//         .connect(ethereumETHSender)
//         .depositETH(fuelETHReceiverAddress, {
//           value: parseEther(NUM_ETH),
//         });
//       const receipt = await tx.wait();
//       expect(receipt!.status).to.equal(1);

//       // parse events from logs
//       const filter = env.eth.fuelMessagePortal.filters.MessageSent(
//         undefined, // Args set to null since there should be just 1 event for MessageSent
//         undefined,
//         undefined,
//         undefined,
//         undefined
//       );

//       const [event, ...restOfEvents] =
//         await env.eth.fuelMessagePortal.queryFilter(
//           filter,
//           receipt!.blockNumber,
//           receipt!.blockNumber
//         );
//       expect(restOfEvents.length).to.be.eq(0); // Should be only 1 event

//       fuelETHMessageNonce = new BN(event.args.nonce.toString());

//       // check that the sender balance has decreased by the expected amount
//       const newSenderBalance = await env.eth.provider.getBalance(
//         ethereumETHSenderAddress,
//         receipt!.blockNumber
//       );

//       const txCost = receipt!.fee;

//       const expectedSenderBalance =
//         (await env.eth.provider.getBalance(
//           ethereumETHSender,
//           receipt!.blockNumber - 1
//         )) -
//         txCost -
//         parseEther(NUM_ETH);

//       expect(newSenderBalance).to.be.eq(expectedSenderBalance);
//     });

//     it('Wait for ETH to arrive on Fuel', async function () {
//       // wait for message to appear in fuel client
//       expect(
//         await waitForMessage(
//           env.fuel.provider,
//           fuelETHReceiver,
//           fuelETHMessageNonce,
//           FUEL_MESSAGE_TIMEOUT_MS
//         )
//       ).to.not.be.null;

//       // check that the recipient balance has increased by the expected amount
//       const newReceiverBalance = await env.fuel.provider.getBalance(
//         fuelETHReceiver,
//         BASE_ASSET_ID
//       );
//       expect(
//         newReceiverBalance.eq(
//           fuelETHReceiverBalance.add(fuels_parseEther(NUM_ETH))
//         )
//       ).to.be.true;
//     });
//   });

//   describe('Send ETH from Fuel', async () => {
//     const NUM_ETH = '0.001';
//     let fuelETHSender: FuelWallet;
//     let fuelETHSenderBalance: BN;
//     let ethereumETHReceiver: Signer;
//     let ethereumETHReceiverAddress: string;
//     let ethereumETHReceiverBalance: bigint;
//     let withdrawMessageProof: MessageProof | null;

//     before(async () => {
//       fuelETHSender = env.fuel.signers[1];
//       fuelETHSenderBalance = await fuelETHSender.getBalance(BASE_ASSET_ID);
//       ethereumETHReceiver = env.eth.signers[1];
//       ethereumETHReceiverAddress = await ethereumETHReceiver.getAddress();
//       ethereumETHReceiverBalance = await env.eth.provider.getBalance(
//         ethereumETHReceiver
//       );
//     });

//     it('Send ETH via OutputMessage', async () => {
//       withdrawMessageProof = await generateWithdrawalMessageProof(
//         fuelETHSender,
//         ethereumETHReceiverAddress,
//         NUM_ETH
//       );

//       // check that the sender balance has decreased by the expected amount
//       const newSenderBalance = await fuelETHSender.getBalance(BASE_ASSET_ID);

//       // Get just the first 3 digits of the balance to compare to the expected balance
//       // this is required because the payment of gas fees is not deterministic
//       const diffOnSenderBalance = newSenderBalance
//         .sub(fuelETHSenderBalance)
//         .formatUnits();
//       expect(diffOnSenderBalance.startsWith(NUM_ETH)).to.be.true;
//     });

//     it('Relay Message from Fuel on Ethereum', async () => {
//       await relayMessage(env, withdrawMessageProof!);
//     });

//     it('Check ETH arrived on Ethereum', async () => {
//       // check that the recipient balance has increased by the expected amount
//       const newReceiverBalance = await env.eth.provider.getBalance(
//         ethereumETHReceiver
//       );

//       expect(
//         newReceiverBalance <= ethereumETHReceiverBalance + parseEther(NUM_ETH)
//       ).to.be.true;
//     });
//   });

//   describe('ETH Withdrawls based on rate limit updates', async () => {
//     const NUM_ETH = '9';
//     const largeRateLimit = `30`;
//     let fuelETHSender: FuelWallet;
//     let ethereumETHReceiver: Signer;
//     let ethereumETHReceiverAddress: string;
//     let withdrawMessageProof: MessageProof | null;
//     let rateLimitDuration: bigint;

//     before(async () => {
//       fuelETHSender = env.fuel.signers[1];
//       ethereumETHReceiver = env.eth.signers[1];
//       ethereumETHReceiverAddress = await ethereumETHReceiver.getAddress();

//       await env.eth.fuelMessagePortal
//         .connect(env.eth.deployer)
//         .updateRateLimitStatus(true);
//       rateLimitDuration = await env.eth.fuelMessagePortal.RATE_LIMIT_DURATION();
//     });

//     it('Checks rate limit params after relaying', async () => {
//       withdrawMessageProof = await generateWithdrawalMessageProof(
//         fuelETHSender,
//         ethereumETHReceiverAddress,
//         NUM_ETH
//       );

//       const withdrawnAmountBeforeRelay =
//         await env.eth.fuelMessagePortal.currentPeriodAmount();

//       await relayMessage(env, withdrawMessageProof!);

//       const currentPeriodAmount =
//         await env.eth.fuelMessagePortal.currentPeriodAmount();

//       expect(
//         currentPeriodAmount === parseEther(NUM_ETH) + withdrawnAmountBeforeRelay
//       ).to.be.true;
//     });

//     it('Relays ETH after the rate limit is updated', async () => {
//       const deployer = env.eth.deployer;
//       const newRateLimit = `30`;

//       await env.eth.fuelMessagePortal
//         .connect(deployer)
//         .resetRateLimitAmount(parseEther(newRateLimit));

//       withdrawMessageProof = await generateWithdrawalMessageProof(
//         fuelETHSender,
//         ethereumETHReceiverAddress,
//         NUM_ETH
//       );

//       const withdrawnAmountBeforeRelay =
//         await env.eth.fuelMessagePortal.currentPeriodAmount();

//       let currentWIthdrawnAmountReset = false;

//       if (withdrawnAmountBeforeRelay > parseEther(newRateLimit)) {
//         currentWIthdrawnAmountReset = true;

//         // fast forward time
//         await env.eth.provider.send('evm_increaseTime', [
//           Number(rateLimitDuration) * 2,
//         ]);
//         await env.eth.provider.send('evm_mine', []); // Mine a new block
//       }

//       await relayMessage(env, withdrawMessageProof!);

//       const currentPeriodAmount =
//         await env.eth.fuelMessagePortal.currentPeriodAmount();

//       if (currentWIthdrawnAmountReset)
//         expect(currentPeriodAmount === parseEther(NUM_ETH)).to.be.true;
//       else {
//         expect(
//           currentPeriodAmount ===
//             parseEther(NUM_ETH) + withdrawnAmountBeforeRelay
//         ).to.be.true;
//       }
//     });

//     it('Rate limit parameters are updated when current withdrawn amount is more than the new limit & set a new higher limit', async () => {
//       const deployer = env.eth.deployer;
//       const newRateLimit = `10`;

//       let withdrawnAmountBeforeReset =
//         await env.eth.fuelMessagePortal.currentPeriodAmount();

//       await env.eth.fuelMessagePortal
//         .connect(deployer)
//         .resetRateLimitAmount(parseEther(newRateLimit));

//       let currentWithdrawnAmountAfterSettingLimit =
//         await env.eth.fuelMessagePortal.currentPeriodAmount();

//       // current withdrawn amount doesn't change when rate limit is updated
//       expect(
//         currentWithdrawnAmountAfterSettingLimit === withdrawnAmountBeforeReset
//       ).to.be.true;

//       withdrawnAmountBeforeReset =
//         await env.eth.fuelMessagePortal.currentPeriodAmount();

//       await env.eth.fuelMessagePortal
//         .connect(deployer)
//         .resetRateLimitAmount(parseEther(largeRateLimit));

//       currentWithdrawnAmountAfterSettingLimit =
//         await env.eth.fuelMessagePortal.currentPeriodAmount();

//       expect(
//         currentWithdrawnAmountAfterSettingLimit === withdrawnAmountBeforeReset
//       ).to.be.true;
//     });

//     it('Rate limit parameters are updated when the initial duration is over', async () => {
//       // fast forward time
//       await env.eth.provider.send('evm_increaseTime', [
//         Number(rateLimitDuration) * 2,
//       ]);
//       await env.eth.provider.send('evm_mine', []); // Mine a new block

//       const currentPeriodEndBeforeRelay =
//         await env.eth.fuelMessagePortal.currentPeriodEnd();

//       withdrawMessageProof = await generateWithdrawalMessageProof(
//         fuelETHSender,
//         ethereumETHReceiverAddress,
//         NUM_ETH
//       );

//       await relayMessage(env, withdrawMessageProof!);

//       const currentPeriodEndAfterRelay =
//         await env.eth.fuelMessagePortal.currentPeriodEnd();

//       expect(currentPeriodEndAfterRelay > currentPeriodEndBeforeRelay).to.be
//         .true;

//       const currentPeriodAmount =
//         await env.eth.fuelMessagePortal.currentPeriodAmount();

//       expect(currentPeriodAmount === parseEther(NUM_ETH)).to.be.true;
//     });

//     it('Rate limit parameters are updated when new limit is set after the initial duration', async () => {
//       const deployer = await env.eth.deployer;
//       const newRateLimit = `40`;

//       const currentWithdrawnAmountBeforeSettingLimit =
//         await env.eth.fuelMessagePortal.currentPeriodAmount();
//       const currentPeriodEndBeforeSettingLimit =
//         await env.eth.fuelMessagePortal.currentPeriodEnd();

//       // fast forward time
//       await env.eth.provider.send('evm_increaseTime', [
//         Number(rateLimitDuration) * 2,
//       ]);
//       await env.eth.provider.send('evm_mine', []); // Mine a new block

//       await env.eth.fuelMessagePortal
//         .connect(deployer)
//         .resetRateLimitAmount(parseEther(newRateLimit));

//       const currentPeriodEndAfterSettingLimit =
//         await env.eth.fuelMessagePortal.currentPeriodEnd();
//       const currentWithdrawnAmountAfterSettingLimit =
//         await env.eth.fuelMessagePortal.currentPeriodAmount();

//       expect(
//         currentPeriodEndAfterSettingLimit > currentPeriodEndBeforeSettingLimit
//       ).to.be.true;

//       expect(
//         currentWithdrawnAmountBeforeSettingLimit >
//           currentWithdrawnAmountAfterSettingLimit
//       ).to.be.true;

//       expect(currentWithdrawnAmountAfterSettingLimit == 0n).to.be.true;
//     });
//   });

//   // stopping containers post the test
//   after(async () => {
//     await containers.postGresContainer.stop();
//     await containers.l1_node.stop();

//     await containers.fuel_node.stop();

//     await containers.block_committer.stop();
//   });
// });
