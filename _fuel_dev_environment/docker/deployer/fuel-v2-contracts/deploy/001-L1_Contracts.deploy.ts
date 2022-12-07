import { DeployFunction } from "hardhat-deploy/dist/types";

const deployFn: DeployFunction = async (hre) => {
  const { deploy } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);
  const poaSigner = '0x48abc67B8Da0B4c9C544299cB24028F07cF2595A'; //pk:0xa449b1ffee0e2205fa924c6740cc48b3b473aa28587df6dab12abc245d1f5298

  // Deploy libraries
  let binaryMerkleTreeLib = await deploy("BinaryMerkleTreeLib", {
    contract: "BinaryMerkleTree",
    from: deployer,
    args: [],
    log: true,
  });

  // Deploy consensus contracts
  let fuelSidechainConsensus = await deploy("FuelSidechainConsensus", {
    contract: "FuelSidechainConsensus",
    from: deployer,
    args: [poaSigner],
    log: true,
  });

  // Deploy messaging contracts
  let fuelMessagePortal = await deploy("FuelMessagePortal", {
    contract: "FuelMessagePortal",
    from: deployer,
    args: [fuelSidechainConsensus.address],
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
