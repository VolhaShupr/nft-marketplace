import { ethers } from "hardhat";

async function main() {
  const nftContractFactory = await ethers.getContractFactory("ERC721Token");
  const nft = await nftContractFactory.deploy();
  await nft.deployed();

  console.log("NFT contract deployed to:", nft.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
