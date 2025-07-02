# House Party Protocol's Contracts

## Contract list
* HPP_L1_Token.sol : House Party Protocol ERC20 Standard Token For Ethereum.
* HPP_Vesting_AIP21.sol : 24-month vesting program for AIP-21 voters


## How to Deploy:

```shell
# Deploy HPP Token
npx hardhat run scripts/HPP_L1_Token.deploy.js --network mainnet
npx hardhat run scripts/HPP_L1_Token.deploy.js --network sepolia

# Deploy HPP Vesting AIP-21 (after deploying HPP Token)
npx hardhat run scripts/HPP_Vesting_AIP21.deploy.js --network mainnet
npx hardhat run scripts/HPP_Vesting_AIP21.deploy.js --network sepolia
```

## How to Contract Verify:

```shell
# Verify HPP Token
npx hardhat verify --network mainnet <DEPLOYED CONTRACT ADDRESS> <RECIPIENT ADDRESS> <OWNER ADDRESS>
npx hardhat verify --network sepolia <DEPLOYED CONTRACT ADDRESS> <RECIPIENT ADDRESS> <OWNER ADDRESS>
npx hardhat verify --network hpp_sepolia <DEPLOYED CONTRACT ADDRESS> <Constructor arguments>
npx hardhat verify --network hpp_mainnet <DEPLOYED CONTRACT ADDRESS> <Constructor arguments>
