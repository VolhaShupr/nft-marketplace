//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./NFT.sol";

// import "hardhat/console.sol";
// console.log("Changing greeting from '%s' to '%s'", greeting, _greeting);

contract Marketplace is ERC721Holder, Ownable {

    using SafeERC20 for IERC20;

    NFT private _nft;
    IERC20 private _paymentToken;

    struct MarketItem {
        address owner;
        uint price;
    }

    mapping (uint => MarketItem) private _listedItems;

    event CreateItem(uint indexed tokenId, address indexed owner, string tokenURI);
    event ListItem(uint indexed tokenId, uint price, bool listed);
    event BuyItem(uint indexed tokenId, address indexed oldOwner, address indexed newOwner, uint price);

    constructor(address nft, address ERC20Token) {
        _nft = NFT(nft);
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

        item.price = price;
        item.owner = msg.sender;

        _nft.safeTransferFrom(msg.sender, address(this), tokenId);

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

        emit BuyItem(tokenId, item.owner, msg.sender, item.price);
        delete _listedItems[tokenId];
    }

}
