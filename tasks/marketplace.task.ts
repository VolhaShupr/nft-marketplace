import { task } from "hardhat/config";

task("grantMinterRole", "Grants minter role")
  .addParam("tokenaddr", "The address of token contract")
  .addParam("minteraddr", "The address of minter account")
  .setAction(async ({ tokenaddr: tokenAddress, minteraddr: minterAddress }, hre) => {
    const token = await hre.ethers.getContractAt("ERC721Token", tokenAddress);
    const role = hre.ethers.utils.id("MINTER_ROLE");

    await token.grantRole(role, minterAddress);

    console.log(`Minter role granted to ${minterAddress}`);
  });

task("createItem", "Creates marketplace nft token")
  .addParam("contractaddr", "The contract address")
  .addParam("tokenuri", "The token URI")
  .addOptionalParam("recipientaddr", "The recipient address")
  .setAction(async ({ contractaddr: contractAddress, tokenuri: tokenURI, recipientaddr: recipientAddress }, hre) => {
    const [signer] = await hre.ethers.getSigners();
    const toAddress = recipientAddress || signer.address;

    const marketplace = await hre.ethers.getContractAt("Marketplace", contractAddress);

    await marketplace.createItem(tokenURI, toAddress);

    console.log(`Minted nft with metadata at ${tokenURI} to address ${toAddress}`);
  });
