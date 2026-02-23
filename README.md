# House Party Protocol's Contracts

## Contract list
* HPP_L1_Token.sol : House Party Protocol ERC20 Standard Token For Ethereum.
* HPP_Vesting.sol : Linear vesting contract for token distribution programs (configurable start time, duration, and name)
* HPP_Migration_AERGO.sol : AERGO to HPP Migration Contract
* HPP_Migration_AQT.sol : AQT to HPP Migration Contract
* HPP_Custody_Staking.sol : Custody staking contract with cooldown period for unstaking


## How to Test:

```shell
# TESTS HPP Custody Staking (before deploying HPP Custody Staking)
npx hardhat test test/HPPCustodyStaking.test.js
```

## How to Deploy:

```shell
# Deploy HPP Token
npx hardhat run scripts/HPP_L1_Token.deploy.js --network mainnet
npx hardhat run scripts/HPP_L1_Token.deploy.js --network sepolia

# Deploy HPP Vesting (after deploying HPP Token)
npx hardhat run scripts/HPP_Vesting.deploy.js --network mainnet
npx hardhat run scripts/HPP_Vesting.deploy.js --network sepolia

# Deploy HPP Custody Staking (after deploying HPP Token)
npx hardhat run scripts/HPP_Custody_Staking.deploy.js --network hpp_mainnet
npx hardhat run scripts/HPP_Custody_Staking.deploy.js --network hpp_sepolia
```

## How to Contract Verify:

```shell
# Verify HPP Token
npx hardhat verify --network mainnet <DEPLOYED CONTRACT ADDRESS> <RECIPIENT ADDRESS> <OWNER ADDRESS>
npx hardhat verify --network sepolia <DEPLOYED CONTRACT ADDRESS> <RECIPIENT ADDRESS> <OWNER ADDRESS>
npx hardhat verify --network hpp_sepolia <DEPLOYED CONTRACT ADDRESS> <Constructor arguments>
npx hardhat verify --network hpp_mainnet <DEPLOYED CONTRACT ADDRESS> <Constructor arguments>

# Verify HPP Vesting
npx hardhat verify --network <NETWORK> --contract contracts/HPP_Vesting.sol:HPP_Vesting <DEPLOYED CONTRACT ADDRESS> <HPP_TOKEN_ADDRESS> <OWNER_ADDRESS> <VESTING_START_TIME> <VESTING_DURATION> "<VESTING_NAME>"

# Verify HPP Custody Staking
npx hardhat verify --network hpp_mainnet <DEPLOYED CONTRACT ADDRESS> <HPP_TOKEN_ADDRESS> <CUSTODY_WALLET> <COOLDOWN_DURATION>
npx hardhat verify --network hpp_sepolia <DEPLOYED CONTRACT ADDRESS> <HPP_TOKEN_ADDRESS> <CUSTODY_WALLET> <COOLDOWN_DURATION>
