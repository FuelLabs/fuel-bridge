import { DeployFunction } from "hardhat-deploy/dist/types";

const deployFn: DeployFunction = async (hre) => {
  const { deploy } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);

  // Deploy libraries
  let binaryMerkleTreeLib = await deploy("BinaryMerkleTreeLib", {
    contract: "BinaryMerkleTree",
    from: deployer,
    args: [],
    log: true,
  });

  // Deploy messaging contracts
  let fuelMessagePortal = await deploy("FuelMessagePortal", {
    contract: "FuelMessagePortal",
    from: deployer,
    args: [],
    libraries: {
      BinaryMerkleTree: binaryMerkleTreeLib.address,
    },
    log: true,
  });

  // Deploy contract for ERC20 bridging
  let l1ERC20Gateway = await deploy("L1ERC20Gateway", {
    contract: "L1ERC20Gateway",
    from: deployer,
    args: [
      fuelMessagePortal.address,
    ],
    log: true,
  });
};

// This is kept during an upgrade. So no upgrade tag.
deployFn.tags = ["L1_Contracts"];

export default deployFn;
