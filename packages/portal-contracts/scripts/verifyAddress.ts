import hardhat, { ethers } from 'hardhat';
import readline from 'readline';

// Script to verify the deployed code of the Fuel v2 system contracts

async function main() {
  // Check that the node is up
  try {
    await ethers.provider.getBlockNumber();
  } catch (e) {
    throw new Error(
      `Failed to connect to RPC "${ethers.provider.connection.url}". Make sure your environment variables and configuration are correct.`
    );
  }

  // Get the contract address to verify
  console.log(
    `\nPlease enter the deployed contract address you would like to verify the source for.`
  ); // eslint-disable-line no-console
  const contractAddress = await contractAddressPrompt();

  // Verify to the project source files
  try {
    console.log(`\nVerifying deployed contract source...`); // eslint-disable-line no-console
    await hardhat.run('verify', {
      address: contractAddress,
      constructorArguments: [],
    });
  } catch (e) {
    let message = 'An uknown issue occurred while verifying deployed contract.';
    if (e instanceof Error) message = e.message;
    console.error(message); // eslint-disable-line no-console
  }
}

// Simple CLI input loop for getting a contract address.
export async function contractAddressPrompt(): Promise<string> {
  let contractAddress = validateContractAddress(
    await textPrompt('Contract address: ')
  );
  if (contractAddress === null) {
    do {
      console.log('Invalid contract address.'); // eslint-disable-line no-console
      contractAddress = validateContractAddress(
        await textPrompt('Contract address: ')
      );
    } while (contractAddress === null);
  }
  return contractAddress;
}

// Simple confirmation loop for CLI input.
export async function textPrompt(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(function (resolve) {
    rl.question(prompt, async function (answer) {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Checks if the given contract address is valid (returns null if invalid)
function validateContractAddress(address: string): string | null {
  try {
    return ethers.utils.getAddress(address.toLowerCase());
  } catch (e) {}
  return null;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error); // eslint-disable-line no-console
    process.exit(1);
  });
