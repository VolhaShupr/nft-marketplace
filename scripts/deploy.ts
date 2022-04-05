import { ethers } from "hardhat";

async function main() {
  const marketplaceContractFactory = await ethers.getContractFactory("Marketplace");
  // const marketplaceContract = await marketplaceContractFactory.deploy();

  // await marketplaceContract.deployed();

  // console.log("Marketplace contract deployed to:", marketplaceContract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
