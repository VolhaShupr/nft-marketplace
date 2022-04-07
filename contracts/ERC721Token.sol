//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract ERC721Token is ERC721URIStorage, AccessControl {

    bytes32 private constant MINTER_ROLE = keccak256("MINTER_ROLE");

    using Counters for Counters.Counter;
    Counters.Counter private currentTokenId;

    constructor() ERC721("NFTForMarketplace721", "Mrkt721") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function safeMint(address recipient, string memory tokenURI) external onlyRole(MINTER_ROLE) returns (uint256) {
        currentTokenId.increment();
        uint256 newItemId = currentTokenId.current();

        _safeMint(recipient, newItemId);
        _setTokenURI(newItemId, tokenURI);

        return newItemId;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

}
