import { expect } from "chai";
import { ethers, network } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const toBigNumber = (amount: number): BigNumber => ethers.utils.parseUnits(amount.toString());
async function increaseTime(min: number) {
  const seconds = min * 60;
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

const ZERO_ADDRESS = ethers.constants.AddressZero;

describe("NFT Marketplace", () => {

  const paymentTokenInitialBalance = toBigNumber(100);
  const nftURI = "https://ipfs.metadata/1";
  const nftId = 1;
  const nftPrice = toBigNumber(2);

  let marketplace: Contract,
    nftToken: Contract,
    paymentToken: Contract,
    owner: SignerWithAddress,
    account1: SignerWithAddress,
    account2: SignerWithAddress,
    account3: SignerWithAddress,
    marketplaceAddress: string,
    account1Address: string,
    account2Address: string;

  let clean: any; // snapshot

  before(async () => {
    [owner, account1, account2, account3] = await ethers.getSigners();
    account1Address = account1.address;
    account2Address = account2.address;

    const tokenContractFactory = await ethers.getContractFactory("Token");
    paymentToken = await tokenContractFactory.deploy("Payment Token", "PMT", paymentTokenInitialBalance);
    await paymentToken.deployed();
    await paymentToken.mint(account1Address, paymentTokenInitialBalance);
    await paymentToken.mint(account2Address, paymentTokenInitialBalance);
    await paymentToken.mint(account3.address, paymentTokenInitialBalance);

    const nftContractFactory = await ethers.getContractFactory("NFT");
    nftToken = await nftContractFactory.deploy();
    await nftToken.deployed();

    const marketplaceContractFactory = await ethers.getContractFactory("Marketplace");
    marketplace = await marketplaceContractFactory.deploy(nftToken.address, paymentToken.address);
    await marketplace.deployed();
    marketplaceAddress = marketplace.address;

    const role = ethers.utils.id("MINTER_ROLE");
    await nftToken.grantRole(role, marketplaceAddress);

    clean = await network.provider.request({ method: "evm_snapshot", params: [] });
  });

  afterEach(async () => {
    await network.provider.request({ method: "evm_revert", params: [clean] });
    clean = await network.provider.request({ method: "evm_snapshot", params: [] });
  });

  it("Should create nft item for the specified account", async () => {
    await expect(marketplace.createItem(nftURI, account1Address))
      .to.emit(marketplace, "CreateItem")
      .withArgs(nftId, account1Address, nftURI);

    expect(await nftToken.ownerOf(nftId)).to.equal(account1Address);
  });

  describe("Listing", () => {
    beforeEach(async () => {
      await marketplace.createItem(nftURI, account1Address);
      await marketplace.createItem(nftURI, account1Address);
      await nftToken.connect(account1).setApprovalForAll(marketplaceAddress, true);
      await marketplace.connect(account1).listItem(nftId, nftPrice);
      await paymentToken.connect(account2).approve(marketplaceAddress, paymentTokenInitialBalance);
    });

    it("Should list nft item", async () => {
      await expect(marketplace.connect(account1).listItem(nftId, 0)).to.be.revertedWith("Not valid price");
      await expect(marketplace.connect(account1).listItem(nftId, nftPrice)).to.be.revertedWith("Token has been already listed");

      await expect(marketplace.connect(account1).listItem(2, nftPrice))
        .to.emit(marketplace, "ListItem")
        .withArgs(2, nftPrice, true);

      expect(await nftToken.ownerOf(nftId)).to.equal(marketplaceAddress);
    });

    it("Should cancel nft listing", async () => {
      await expect(marketplace.connect(account1).cancel(2)).to.be.revertedWith("Not permitted");
      await expect(marketplace.connect(account2).cancel(nftId)).to.be.revertedWith("Not permitted");

      await expect(marketplace.connect(account1).cancel(nftId))
        .to.emit(marketplace, "ListItem")
        .withArgs(nftId, 0, false);

      expect(await nftToken.ownerOf(nftId)).to.equal(account1Address);
    });

    it("Should buy nft item", async () => {
      await expect(marketplace.connect(account1).buyItem(2)).to.be.revertedWith("Token is not listed");
      await expect(marketplace.connect(account1).buyItem(nftId)).to.be.revertedWith("Seller and buyer should differ");

      await expect(marketplace.connect(account2).buyItem(nftId))
        .to.emit(marketplace, "BuyItem")
        .withArgs(nftId, account1Address, account2Address, nftPrice);

      expect(await nftToken.ownerOf(nftId)).to.equal(account2Address);
    });

  });



});
