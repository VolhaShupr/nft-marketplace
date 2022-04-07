import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const { ERC721_TOKEN_ADDRESS, PAYMENT_TOKEN_ADDRESS } = process.env;

async function main() {
  const erc721Token = ERC721_TOKEN_ADDRESS as string;
  const paymentToken = PAYMENT_TOKEN_ADDRESS as string;
  const marketplaceContractFactory = await ethers.getContractFactory("Marketplace");
  const marketplaceContract = await marketplaceContractFactory.deploy(erc721Token, paymentToken);

  await marketplaceContract.deployed();

  console.log("Marketplace contract deployed to:", marketplaceContract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
