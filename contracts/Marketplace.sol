//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ERC721Token.sol";

contract Marketplace is ERC721Holder, ReentrancyGuard, Ownable {

    using SafeERC20 for IERC20;

    ERC721Token private _nft;
    IERC20 private _paymentToken;

    struct MarketItem {
        address owner; // seller
        uint price;
    }

    /// @dev nftId => MarketItem
    mapping (uint => MarketItem) private _listedItems;

    struct AuctionItem {
        address owner;
        uint startDate;
        uint latestPrice;
        address latestBidder;
        uint participantsCount;
    }

    /// @dev nftId => AuctionItem
    mapping (uint => AuctionItem) private _auctionItems;

    uint public auctionPeriod = 3 days;

    /// @dev condition for the 'successful' ending of the auction
    uint public auctionMinParticipantsCount = 2;

    /**
    * @dev Emitted when user creates nft item
    * @param tokenId Id of the created item
    * @param owner address of the created item
    * @param tokenURI Item metadata URI
    */
    event CreateItem(uint indexed tokenId, address indexed owner, string tokenURI);

    /**
    * @dev Emitted when item owner changes listing status of the nft (lists for sale or cancels listing)
    * @param tokenId Id of the listed item
    * @param price Price of the listed item. value 0 - in case of cancelling
    * @param listed Whether item was listed for sale or listing was cancelled
    */
    event ListItem(uint indexed tokenId, uint price, bool listed);

    /**
    * @dev Emitted when user buys nft item
    * @param tokenId Purchased item id
    * @param newOwner User address that bought the item
    * @param price Purchase price
    */
    event BuyItem(uint indexed tokenId, address indexed newOwner, uint price);

    /**
    * @dev Emitted when item owner lists nft on auction
    * @param tokenId Id of the created item
    * @param minPrice Start price of the item
    */
    event ListItemOnAuction(uint indexed tokenId, uint minPrice);

    /**
    * @dev Emitted when user makes a bid
    * @param tokenId Id of the item on auction
    * @param bidder Bidder address
    * @param price Bid price
    */
    event MakeBid(uint indexed tokenId, address bidder, uint price);

    /**
    * @dev Emitted when item owner finishes the auction
    * @param tokenId Id of the created item
    * @param newOwner User address that receives the item (depends on amount of bids)
    * @param price Final price. Value 0 - in case of 'unsuccessful' finishing the auction when item returns to the initial owner
    */
    event FinishAuction(uint indexed tokenId, address indexed newOwner, uint price);

    /**
     * @dev Initializes the contract by setting a `nft` and a `ERC20Token`
     */
    constructor(address nft, address ERC20Token) {
        _nft = ERC721Token(nft);
        _paymentToken = IERC20(ERC20Token);
    }

    /**
    * @dev Mints nft item to the specified address
    * @param tokenURI New item metadata URI
    * @param to Address of the new item recipient
    *
    * Emits a {CreateItem} event
    */
    function createItem(string memory tokenURI, address to) external {
        uint tokenId = _nft.safeMint(to, tokenURI);

        emit CreateItem(tokenId, to, tokenURI);
    }

    /**
    * @dev Lists for sale nft item
    * @param tokenId Id of the item to list
    * @param price Price of the item to list
    *
    * Requirements:
    * - `price` cannot be the zero
    * - Item should not be already listed
    *
    * Emits a {ListItem} event
    */
    function listItem(uint tokenId, uint price) external {
        require(price > 0, "Not valid price");

        MarketItem storage item = _listedItems[tokenId];
        require(item.owner == address(0), "Token has been already listed");

        _nft.safeTransferFrom(msg.sender, address(this), tokenId);

        item.owner = msg.sender;
        item.price = price;

        emit ListItem(tokenId, price, true);
    }


    /**
    * @dev Cancels item listing
    * @param tokenId Id of the item to cancel
    *
    * Requirements:
    * - `msg.sender` should be item owner
    *
    * Emits a {ListItem} event
    */
    function cancel(uint tokenId) external {
        require(_listedItems[tokenId].owner == msg.sender, "Not permitted");

        _nft.safeTransferFrom(address(this), msg.sender, tokenId);

        emit ListItem(tokenId, 0, false);
        delete _listedItems[tokenId];
    }

    /**
    * @dev Transfers item to the buyer's address (`msg.sender`)
    * @param tokenId Id of the item to cancel
    *
    * Requirements:
    * - Item should be already listed
    * - `msg.sender` (buyer) should be not the same address that item owner (seller)
    *
    * Emits a {BuyItem} event
    */
    function buyItem(uint tokenId) external {
        MarketItem memory item = _listedItems[tokenId];

        require(item.owner != address(0), "Token is not listed");
        require(item.owner != msg.sender, "Seller and buyer should differ");

        _paymentToken.safeTransferFrom(msg.sender, item.owner, item.price);
        _nft.safeTransferFrom(address(this), msg.sender, tokenId);

        emit BuyItem(tokenId, msg.sender, item.price);
        delete _listedItems[tokenId];
    }

    /**
    * @dev Lists nft item on the auction
    * @param tokenId Id of the item to list
    * @param minPrice Start price of the item to list
    *
    * Requirements:
    * - `minPrice` cannot be the zero
    * - Item should not be already listed on the auction
    *
    * Emits a {ListItemOnAuction} event
    */
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

    /**
    * @dev Updates the latest price and the latest bidder for the item on auction
    * @param tokenId Id of the item on auction
    * @param price Bid price
    *
    * Requirements:
    * - Item should be already listed on the auction
    * - Auction should be in process
    * - `price` should be greater than previous bid or min price
    *
    * Emits a {MakeBid} event
    */
    function makeBid(uint tokenId, uint price) external nonReentrant {
        AuctionItem storage item = _auctionItems[tokenId];

        require(item.owner != address(0), "Token is not listed on auction");
        require((block.timestamp - item.startDate) < auctionPeriod, "Bids are no longer accepted");
        require(price > item.latestPrice, "Bid should be greater than the latest one");

        if (item.participantsCount > 0) {
            _paymentToken.safeTransfer(item.latestBidder, item.latestPrice); // return frozen bid
        }

        _paymentToken.safeTransferFrom(msg.sender, address(this), price);

        item.latestPrice = price;
        item.latestBidder = msg.sender;
        item.participantsCount++;

        emit MakeBid(tokenId, msg.sender, price);
    }

    /**
    * @dev Finishes the auction and transfers item to the winner
    * @param tokenId Id of the item on auction
    *
    * Requirements:
    * - Item should be already listed on the auction
    * - Auction should be ended (auction period should pass)
    *
    * 'Unsuccessful' finishing the auction is when the amount of participants is less than value specified in `auctionMinParticipantsCount`
    * In case of 'unsuccessful' finishing the auction item returns to the initial owner,
    * otherwise to the latest bidder
    *
    * Emits a {FinishAuction} event
    */
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

    /**
    * @dev Sets a new value of the minimum participants number
    * @param newAuctionMinParticipantsCount Minimum number of participants
    */
    function updateAuctionMinParticipants(uint newAuctionMinParticipantsCount) external onlyOwner {
        auctionMinParticipantsCount = newAuctionMinParticipantsCount;
    }

    /**
    * @dev Sets a new value of the auction period
    * @param newAuctionPeriod New auction period (in sec)
    */
    function updateAuctionPeriod(uint newAuctionPeriod) external onlyOwner {
        auctionPeriod = newAuctionPeriod;
    }

}
