import { DeployFunction } from "hardhat-deploy/dist/types";
import { config as dotEnvConfig } from "dotenv";

import { fundAccount, BIG_BALANCE } from "../utils/deploy-utils";

dotEnvConfig();

const isForkedNetwork = !!process.env.FORK_URL;
const deployFn: DeployFunction = async (hre) => {
  if (!isForkedNetwork) {
    return;
  }

  console.log(`Running custom setup for forked experimental networks`);
  const { deployer } = await hre.getNamedAccounts();

  // Fund the deployer account so it can be used for the rest of this deployment.
  console.log(`Funding deployer account...`);
  await fundAccount(hre, deployer, BIG_BALANCE);
};

deployFn.tags = ["hardhat", "upgrade"];

export default deployFn;
