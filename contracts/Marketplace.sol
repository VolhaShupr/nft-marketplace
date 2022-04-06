//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./NFT.sol";

// import "hardhat/console.sol";
// console.log("Changing greeting from '%s' to '%s'", greeting, _greeting);

contract Marketplace is ERC721Holder, ReentrancyGuard, Ownable {

    using SafeERC20 for IERC20;

    ERC721Token private _nft;
    IERC20 private _paymentToken;

    struct MarketItem {
        address owner; // seller
        uint price;
    }

    mapping (uint => MarketItem) private _listedItems; // nftId => MarketItem

    struct AuctionItem {
        address owner;
        uint startDate;
        uint latestPrice;
        address latestBidder;
        uint participantsCount;
    }

    mapping (uint => AuctionItem) private _auctionItems; // nftId => AuctionItem

    uint public auctionPeriod = 3 days;
    uint public auctionMinParticipantsCount = 2;

    event CreateItem(uint indexed tokenId, address indexed owner, string tokenURI);
    event ListItem(uint indexed tokenId, uint price, bool listed);
    event BuyItem(uint indexed tokenId, address indexed newOwner, uint price);
    event ListItemOnAuction(uint indexed tokenId, uint minPrice);
    event MakeBid(uint indexed tokenId, address bidder, uint price);
    event FinishAuction(uint indexed tokenId, address indexed newOwner, uint price);

    constructor(address nft, address ERC20Token) {
        _nft = ERC721Token(nft);
        _paymentToken = IERC20(ERC20Token);
    }

    function createItem(string memory tokenURI, address to) external onlyOwner {
        uint tokenId = _nft.safeMint(to, tokenURI);

        emit CreateItem(tokenId, to, tokenURI);
    }

    function listItem(uint tokenId, uint price) external {
        require(price > 0, "Not valid price");

        MarketItem storage item = _listedItems[tokenId];
        require(item.owner == address(0), "Token has been already listed");

        _nft.safeTransferFrom(msg.sender, address(this), tokenId);

        item.owner = msg.sender;
        item.price = price;

        emit ListItem(tokenId, price, true);
    }

    function cancel(uint tokenId) external {
        require(_listedItems[tokenId].owner == msg.sender, "Not permitted");

        _nft.safeTransferFrom(address(this), msg.sender, tokenId);

        emit ListItem(tokenId, 0, false);
        delete _listedItems[tokenId];
    }

    function buyItem(uint tokenId) external {
        MarketItem memory item = _listedItems[tokenId];

        require(item.owner != address(0), "Token is not listed");
        require(item.owner != msg.sender, "Seller and buyer should differ");

        _paymentToken.safeTransferFrom(msg.sender, item.owner, item.price);
        _nft.safeTransferFrom(address(this), msg.sender, tokenId);

        emit BuyItem(tokenId, msg.sender, item.price);
        delete _listedItems[tokenId];
    }

    function listItemOnAuction(uint tokenId, uint minPrice) external {
        require(minPrice > 0, "Not valid price");

        AuctionItem storage item = _auctionItems[tokenId];
        require(item.owner == address(0), "Token has been already listed in auction");

        _nft.safeTransferFrom(msg.sender, address(this), tokenId);

        item.owner = msg.sender;
        item.startDate = block.timestamp;
        item.latestPrice = minPrice;
        item.participantsCount = 0;

        emit ListItemOnAuction(tokenId, minPrice);
    }

    function makeBid(uint tokenId, uint price) external nonReentrant {
        AuctionItem storage item = _auctionItems[tokenId];

        require(item.owner != address(0), "Token is not listed on auction");
        require((block.timestamp - item.startDate) < auctionPeriod, "Bids are no longer accepted");
        require(price > item.latestPrice, "Bid should be greater than the latest one");

        if (item.participantsCount > 0) {
            _paymentToken.safeTransfer(item.latestBidder, item.latestPrice); // return frozen bid
        }

        item.latestPrice = price;
        item.latestBidder = msg.sender;
        item.participantsCount++;

        _paymentToken.safeTransferFrom(msg.sender, address(this), price);

        emit MakeBid(tokenId, msg.sender, price);
    }

    function finishAuction(uint tokenId) external nonReentrant {
        AuctionItem memory item = _auctionItems[tokenId];

        require(item.owner != address(0), "Token is not listed on auction");
        require((block.timestamp - item.startDate) >= auctionPeriod, "Auction cannot be finished now");

        address paymentReceiver;
        address nftReceiver;
        uint price;

        if (item.participantsCount > auctionMinParticipantsCount) {
            paymentReceiver = item.owner;
            nftReceiver = item.latestBidder;
            price = item.latestPrice;
        } else {
            paymentReceiver = item.latestBidder;
            nftReceiver = item.owner;
            price = 0;
        }

        if (item.participantsCount > 0) {
            _paymentToken.safeTransfer(paymentReceiver, item.latestPrice);
        }
        _nft.safeTransferFrom(address(this), nftReceiver, tokenId);

        emit FinishAuction(tokenId, nftReceiver, price);
        delete _auctionItems[tokenId];
    }

    function updateAuctionMinParticipants(uint newAuctionMinParticipantsCount) external onlyOwner {
        auctionMinParticipantsCount = newAuctionMinParticipantsCount;
    }

    function updateAuctionPeriod(uint newAuctionPeriod) external onlyOwner {
        auctionPeriod = newAuctionPeriod;
    }

}
