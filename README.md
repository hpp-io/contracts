# House Party Protocol's Contracts

## Contract list
* HPP_L1_Token.sol : House Party Protocol ERC20 Standard Token For Ethereum.
* HPP_Vesting.sol : Linear vesting contract for token distribution programs (configurable start time, duration, and name)
* HPP_Migration_AERGO.sol : AERGO to HPP Migration Contract
* HPP_Migration_AQT.sol : AQT to HPP Migration Contract
* HPP_Custody_Staking.sol : Custody staking contract with cooldown period for unstaking
* HPP_StakingReward_S1.sol : Season 1 staking reward distribution contract — beneficiaries claim 100% of their reward immediately and exactly once after owner registers them via CSV-driven batch
* HPP_StakingReward_S2.sol : Season 2 staking reward distribution contract — same claim-once model as Season 1, reads beneficiaries from s2_beneficiaries.csv


## How to Test:

```shell
# TESTS HPP Custody Staking (before deploying HPP Custody Staking)
npx hardhat test test/HPPCustodyStaking.test.js

# TESTS HPP Staking Reward S1
npx hardhat test test/HPP_StakingReward_S1.test.js

# TESTS HPP Staking Reward S2
npx hardhat test test/HPP_StakingReward_S2.test.js
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

# Deploy HPP Staking Reward S1 (after deploying HPP Token; requires HPP_TOKEN_ADDRESS env var; optional STAKING_REWARD_OWNER, REWARD_NAME)
# Reads beneficiaries from scripts/staking_reward_beneficiaries/s1_beneficiaries.csv
npx hardhat run scripts/HPP_StakingReward_S1.deploy.js --network mainnet
npx hardhat run scripts/HPP_StakingReward_S1.deploy.js --network sepolia

# Deploy HPP Staking Reward S2 (after deploying HPP Token; requires HPP_TOKEN_ADDRESS env var; optional STAKING_REWARD_OWNER, REWARD_NAME)
# Reads beneficiaries from scripts/staking_reward_beneficiaries/s2_beneficiaries.csv
npx hardhat run scripts/HPP_StakingReward_S2.deploy.js --network mainnet
npx hardhat run scripts/HPP_StakingReward_S2.deploy.js --network sepolia
```

## How to Bridge HPP to Base:

HPP on Ethereum is bridged to Base through the Base standard bridge. The Base-side token is created once
by the `OptimismMintableERC20Factory` predeploy (`0x4200000000000000000000000000000000000012`), which
gives it EIP-2612 permit. Its address is fixed by the name, symbol and decimals in
`scripts/HPP_Base_Bridge.config.js`.

| | Sepolia / Base Sepolia | Ethereum / Base |
| - | - | - |
| L1 HPP | `0xB34e0d1fee60e078D611D4218AFB004b639C7b76` | `0xe33fbE7584EB79e2673abe576B7AC8C0De62565c` |
| L1StandardBridge | `0xfd0Bf71F60660E2f608ed56e1659C450eB113120` | `0x3154Cf16ccdb4C6d922629664174b904d80F2C35` |
| L2 HPP | `0x6562A6ea4F5B1e4293eD0E6146f6Def41f963305` (created, verified) | `0xE9BB73eD2EC7B9F0BE463ce8aF24f2cF0ae7CCE6` (created, verified) |

Mainnet runs need `ALLOW_MAINNET=true`. `RECIPIENT` is optional and defaults to the sender.

```shell
# 1. Create the L2 HPP (once, on the Base side)
npx hardhat run scripts/HPP_Base_Bridge.createL2Token.js --network base_sepolia

# 2. Deposit HPP from Ethereum to Base (on the Ethereum side; approves the exact amount)
AMOUNT=10 npx hardhat run scripts/HPP_Base_Bridge.deposit.js --network sepolia

# 3. Start a withdrawal from Base to Ethereum (on the Base side)
AMOUNT=1 npx hardhat run scripts/HPP_Base_Bridge.withdraw.js --network base_sepolia
```

The withdraw script only starts the withdrawal. Releasing the tokens on Ethereum takes two more
L1 transactions (prove, then finalize after the finalization window), which are not scripted here.

To verify the L2 HPP on BaseScan, submit `scripts/base_bridge_verify/OptimismMintableERC20.standard-input.json`
as Solidity standard JSON input with:

* Contract: `lib/contracts/src/universal/OptimismMintableERC20.sol:OptimismMintableERC20`
* Compiler: `v0.8.15+commit.e14f2714` (optimizer 5000 runs, EVM `london`, already set in the JSON)
* Constructor arguments: ABI-encoded `(address bridge, address remoteToken, string name, string symbol, uint8 decimals)`
  = `(0x4200000000000000000000000000000000000010, <L1 HPP>, "HousePartyProtocol", "HPP", 18)`

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

# Verify HPP Staking Reward S1
npx hardhat verify --network <NETWORK> --contract contracts/HPP_StakingReward_S1.sol:HPP_StakingReward_S1 <DEPLOYED CONTRACT ADDRESS> <HPP_TOKEN_ADDRESS> <OWNER_ADDRESS> "<REWARD_NAME>"

# Verify HPP Staking Reward S2
npx hardhat verify --network <NETWORK> --contract contracts/HPP_StakingReward_S2.sol:HPP_StakingReward_S2 <DEPLOYED CONTRACT ADDRESS> <HPP_TOKEN_ADDRESS> <OWNER_ADDRESS> "<REWARD_NAME>"
