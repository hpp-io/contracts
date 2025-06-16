# House Party Protocol's Contracts

## Contract list
* HPP_L1_Token.sol : House Party Protocol ERC20 Standard Token For Ethereum.


## How to Deploy:

```shell
npx hardhat run scripts/HPP_L1_Token.deploy.js --network mainnet
npx hardhat run scripts/HPP_L1_Token.deploy.js --network sepolia
```

## How to Contract Verify:

```shell
npx hardhat verify --network mainnet <DEPLOYED CONTRACT ADDRESS> <RECIPIENT ADDRESS> <OWNER ADDRESS>
npx hardhat verify --network sepolia <DEPLOYED CONTRACT ADDRESS> <RECIPIENT ADDRESS> <OWNER ADDRESS>
```
