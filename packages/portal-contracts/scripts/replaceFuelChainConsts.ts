import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

const FILE_NAME = '.fuelChainConsts.env';
const FUEL_CHAIN_PATH = join(
  __dirname,
  '../contracts/fuelchain/FuelChainState.sol'
);

function replaceConstantValue(
  fileContent: string,
  contantName: string,
  newValue: string
) {
  const regex = new RegExp(`${contantName}? =? (.*);`);
  return fileContent.replace(regex, (match, value) => {
    return match.replace(value, newValue);
  });
}

// Function used on development environment to replace the constant values
// on FuelChainState.sol with the values from .fuelChainState.env file
// to better tests the contract on local environment and integration tests
async function main() {
  console.log(`Load ${FILE_NAME} file...`);
  const envs = dotenv.parse(readFileSync(join(process.cwd(), FILE_NAME)));

  if (Object.keys(envs).length === 0) {
    throw new Error(`${FILE_NAME} not found`);
  }
  let fileContent = readFileSync(FUEL_CHAIN_PATH).toString();

  Object.keys(envs).forEach((key) => {
    fileContent = replaceConstantValue(fileContent, key, envs[key]);
  });

  writeFileSync(FUEL_CHAIN_PATH, fileContent);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
