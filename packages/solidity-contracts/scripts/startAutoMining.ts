import { ethers } from 'hardhat';

export async function startAutoMining() {
  console.log('Start auto mining...');
  console.log('evm_setAutomine...');
  await ethers.provider.send('evm_setAutomine', [true]);
  console.log('evm_setIntervalMining...');
  await ethers.provider.send('evm_setIntervalMining', [30000]);
  console.log('finish...');
}

startAutoMining()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
