// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HPP_StakingReward_S1
 * @notice Season 1 staking reward distribution. Beneficiaries claim 100% of their
 *         reward immediately and exactly once. Owner registers and (optionally) revokes
 *         pre-claim entries.
 */
contract HPP_StakingReward_S1 is Ownable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    struct Reward {
        address beneficiary;
        uint256 totalAmount;
        bool claimed;
        bool isActive;
    }

    IERC20 public immutable hppToken;
    string public rewardName;

    mapping(address => Reward) public rewards;
    EnumerableSet.AddressSet private beneficiaries;
    uint256 public totalRewardAmount;

    event RewardAdded(address indexed beneficiary, uint256 amount);
    event RewardClaimed(address indexed beneficiary, uint256 amount);
    event RewardRevoked(address indexed beneficiary);

    constructor(
        address _hppToken,
        address _initialOwner,
        string memory _rewardName
    ) Ownable(_initialOwner) {
        require(_hppToken != address(0), "Invalid token address");
        hppToken = IERC20(_hppToken);
        rewardName = _rewardName;
    }
}
