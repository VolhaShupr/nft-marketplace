# 4 NFT marketplace & auction
Sample contract

Etherscan links:
- [marketplace contract](https://rinkeby.etherscan.io/address/0xD329BEF58056AF8260AE12290E3733D13C7fa3E3)
- [nft token contract](https://rinkeby.etherscan.io/address/0x28b8a96E1256e182477965C54aDEf5a303de317C)
- [payment token contract](https://rinkeby.etherscan.io/address/0x08da338ec0947ac3f504abde37a7dbbc856a3ed1)

```shell
npx hardhat accounts
npx hardhat grantMinterRole
npx hardhat createItem

npx hardhat run --network rinkeby scripts/erc721.deploy.ts
npx hardhat run --network rinkeby scripts/marketplace.deploy.ts
npx hardhat verify --network rinkeby DEPLOYED_CONTRACT_ADDRESS <arg>

npx hardhat test
npx hardhat coverage
npx hardhat size-contracts

npx hardhat help
npx hardhat node
npx hardhat compile
npx hardhat clean
```
