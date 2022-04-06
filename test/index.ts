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

const AUCTION_PERIOD_MIN = 3 * 24 * 60; // 3 days

describe("NFT Marketplace", () => {

  const paymentTokenInitialBalance = toBigNumber(100);
  const nftURI = "https://ipfs.metadata/1";
  const nftId = 1;
  const nftId2 = 2;
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
    account2Address: string,
    account3Address: string;

  let clean: any; // snapshot

  before(async () => {
    [owner, account1, account2, account3] = await ethers.getSigners();
    account1Address = account1.address;
    account2Address = account2.address;
    account3Address = account3.address;

    const tokenContractFactory = await ethers.getContractFactory("ERC20Token");
    paymentToken = await tokenContractFactory.deploy("Payment Token", "PMT", paymentTokenInitialBalance);
    await paymentToken.deployed();
    await paymentToken.mint(account1Address, paymentTokenInitialBalance);
    await paymentToken.mint(account2Address, paymentTokenInitialBalance);
    await paymentToken.mint(account3Address, paymentTokenInitialBalance);

    const nftContractFactory = await ethers.getContractFactory("ERC721Token");
    nftToken = await nftContractFactory.deploy();
    await nftToken.deployed();

    const marketplaceContractFactory = await ethers.getContractFactory("Marketplace");
    marketplace = await marketplaceContractFactory.deploy(nftToken.address, paymentToken.address);
    await marketplace.deployed();
    marketplaceAddress = marketplace.address;

    const role = ethers.utils.id("MINTER_ROLE");
    await nftToken.grantRole(role, marketplaceAddress);

    await paymentToken.connect(account1).approve(marketplaceAddress, paymentTokenInitialBalance);
    await paymentToken.connect(account2).approve(marketplaceAddress, paymentTokenInitialBalance);
    await paymentToken.connect(account3).approve(marketplaceAddress, paymentTokenInitialBalance);

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
    });

    describe("[listItem]", () => {
      it("Should revert when price is zero", async () => {
        await expect(marketplace.connect(account1).listItem(nftId, 0)).to.be.revertedWith("Not valid price");
      });

      it("Should revert when nft has been already listed", async () => {
        await expect(marketplace.connect(account1).listItem(nftId, nftPrice)).to.be.revertedWith("Token has been already listed");
      });

      it("Should list nft item", async () => {
        await expect(marketplace.connect(account1).listItem(nftId2, nftPrice))
          .to.emit(marketplace, "ListItem")
          .withArgs(nftId2, nftPrice, true);

        expect(await nftToken.ownerOf(nftId2)).to.equal(marketplaceAddress);
      });
    });

    describe("[cancel]", () => {
      it("Should revert when user cancels not listed nft", async () => {
        await expect(marketplace.connect(account1).cancel(nftId2)).to.be.revertedWith("Not permitted");
      });

      it("Should revert when not nft owner cancels listing", async () => {
        await expect(marketplace.connect(account2).cancel(nftId)).to.be.revertedWith("Not permitted");
      });

      it("Should cancel nft listing", async () => {
        await expect(marketplace.connect(account1).cancel(nftId))
          .to.emit(marketplace, "ListItem")
          .withArgs(nftId, 0, false);

        expect(await nftToken.ownerOf(nftId)).to.equal(account1Address);
      });
    });

    describe("[buyItem]", () => {
      it("Should revert when user buys not listed nft", async () => {
        await expect(marketplace.connect(account1).buyItem(nftId2)).to.be.revertedWith("Token is not listed");
      });

      it("Should revert when nft owner buys his own nft", async () => {
        await expect(marketplace.connect(account1).buyItem(nftId)).to.be.revertedWith("Seller and buyer should differ");
      });

      it("Should buy nft item", async () => {
        await expect(marketplace.connect(account2).buyItem(nftId))
          .to.emit(marketplace, "BuyItem")
          .withArgs(nftId, account2Address, nftPrice);

        expect(await nftToken.ownerOf(nftId)).to.equal(account2Address);
        expect(await paymentToken.balanceOf(account2Address)).to.equal(paymentTokenInitialBalance.sub(nftPrice));
        expect(await paymentToken.balanceOf(account1Address)).to.equal(paymentTokenInitialBalance.add(nftPrice));
      });
    });

  });

  describe("Auction", () => {
    const newPrice1 = nftPrice.add(toBigNumber(1));
    const newPrice2 = newPrice1.add(toBigNumber(3));
    const newPrice3 = newPrice2.add(toBigNumber(5));

    beforeEach(async () => {
      await marketplace.createItem(nftURI, account1Address);
      await marketplace.createItem(nftURI, account1Address);
      await nftToken.connect(account1).setApprovalForAll(marketplaceAddress, true);
      await marketplace.connect(account1).listItemOnAuction(nftId, nftPrice);
    });

    describe("[listItemOnAuction]", () => {
      it("Should revert when price is zero", async () => {
        await expect(marketplace.connect(account1).listItemOnAuction(nftId, 0)).to.be.revertedWith("Not valid price");
      });

      it("Should revert when nft has been already listed in auction", async () => {
        await expect(marketplace.connect(account1).listItemOnAuction(nftId, nftPrice)).to.be.revertedWith("Token has been already listed in auction");
      });

      it("Should list nft on auction", async () => {
        await expect(marketplace.connect(account1).listItemOnAuction(nftId2, nftPrice))
          .to.emit(marketplace, "ListItemOnAuction")
          .withArgs(nftId2, nftPrice);

        expect(await nftToken.ownerOf(nftId2)).to.equal(marketplaceAddress);
      });
    });

    describe("[makeBid]", () => {
      it("Should revert when nft is not listed in auction", async () => {
        await expect(marketplace.connect(account2).makeBid(nftId2, nftPrice)).to.be.revertedWith("Token is not listed on auction");
      });

      it("Should revert if next bid is lower than the latest one", async () => {
        await expect(marketplace.connect(account2).makeBid(nftId, nftPrice)).to.be.revertedWith("Bid should be greater than the latest one");
      });

      it("Should make a bid", async () => {
        await expect(marketplace.connect(account2).makeBid(nftId, newPrice1))
          .to.emit(marketplace, "MakeBid")
          .withArgs(nftId, account2Address, newPrice1);

        expect(await paymentToken.balanceOf(account1Address)).to.equal(paymentTokenInitialBalance);
        expect(await paymentToken.balanceOf(account2Address)).to.equal(paymentTokenInitialBalance.sub(newPrice1));
        expect(await paymentToken.balanceOf(marketplaceAddress)).to.equal(newPrice1);

        await expect(marketplace.connect(account3).makeBid(nftId, newPrice2))
          .to.emit(marketplace, "MakeBid")
          .withArgs(nftId, account3Address, newPrice2);

        expect(await paymentToken.balanceOf(account1Address)).to.equal(paymentTokenInitialBalance);
        expect(await paymentToken.balanceOf(account2Address)).to.equal(paymentTokenInitialBalance);
        expect(await paymentToken.balanceOf(account3Address)).to.equal(paymentTokenInitialBalance.sub(newPrice2));
        expect(await paymentToken.balanceOf(marketplaceAddress)).to.equal(newPrice2);

        await increaseTime(AUCTION_PERIOD_MIN);
        await expect(marketplace.connect(account2).makeBid(nftId, newPrice2.add(3))).to.be.revertedWith("Bids are no longer accepted");
      });
    });

    describe("[finishAuction]", () => {
      it("Should revert when nft is not listed in auction", async () => {
        await expect(marketplace.connect(account1).finishAuction(nftId2)).to.be.revertedWith("Token is not listed on auction");
      });

      it("Should revert when auction period (3 days) is not passed", async () => {
        await increaseTime(AUCTION_PERIOD_MIN - 1);
        await expect(marketplace.connect(account1).finishAuction(nftId)).to.be.revertedWith("Auction cannot be finished now");
      });

      it("Should finish nft auction with 0 participants", async () => {
        await increaseTime(AUCTION_PERIOD_MIN);
        await expect(marketplace.connect(account1).finishAuction(nftId))
          .to.emit(marketplace, "FinishAuction")
          .withArgs(nftId, account1Address, 0);

        expect(await nftToken.ownerOf(nftId)).to.equal(account1Address);
        expect(await paymentToken.balanceOf(account1Address)).to.equal(paymentTokenInitialBalance);
      });

      it("Should finish nft auction with less than 3 bids", async () => {
        await marketplace.connect(account1).makeBid(nftId, newPrice1);
        await marketplace.connect(account2).makeBid(nftId, newPrice2);

        await increaseTime(AUCTION_PERIOD_MIN);
        await expect(marketplace.connect(account1).finishAuction(nftId))
          .to.emit(marketplace, "FinishAuction")
          .withArgs(nftId, account1Address, 0);

        expect(await nftToken.ownerOf(nftId)).to.equal(account1Address);
        expect(await paymentToken.balanceOf(account1Address)).to.equal(paymentTokenInitialBalance);
        expect(await paymentToken.balanceOf(account2Address)).to.equal(paymentTokenInitialBalance);
      });

      it("Should finish nft auction with more than 2 bids", async () => {
        await marketplace.connect(account1).makeBid(nftId, newPrice1);
        await marketplace.connect(account2).makeBid(nftId, newPrice2);
        await marketplace.connect(account3).makeBid(nftId, newPrice3);

        await increaseTime(AUCTION_PERIOD_MIN + 1);
        await expect(marketplace.connect(account2).finishAuction(nftId))
          .to.emit(marketplace, "FinishAuction")
          .withArgs(nftId, account3Address, newPrice3);

        expect(await nftToken.ownerOf(nftId)).to.equal(account3Address);
        expect(await paymentToken.balanceOf(account1Address)).to.equal(paymentTokenInitialBalance.add(newPrice3));
        expect(await paymentToken.balanceOf(account2Address)).to.equal(paymentTokenInitialBalance);
        expect(await paymentToken.balanceOf(account3Address)).to.equal(paymentTokenInitialBalance.sub(newPrice3));
      });
    });

  });

  describe("Admin", () => {
    it("Should update auction period", async () => {
      const newAuctionPeriod = 4 * 24 * 60 * 60; // 4 days

      await marketplace.updateAuctionPeriod(newAuctionPeriod);
      expect(await marketplace.auctionPeriod()).to.equal(newAuctionPeriod);
    });

    it("Should update auction minimum participants count", async () => {
      const newAuctionMinParticipantsCount = 4;

      await marketplace.updateAuctionMinParticipants(newAuctionMinParticipantsCount);
      expect(await marketplace.auctionMinParticipantsCount()).to.equal(newAuctionMinParticipantsCount);
    });

  });

});
