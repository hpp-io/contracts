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

    /**
     * @notice Register a single reward (owner only).
     * @param _beneficiary Reward recipient address.
     * @param _amount Reward amount in token base units.
     */
    function addReward(address _beneficiary, uint256 _amount) external onlyOwner {
        _addReward(_beneficiary, _amount);
    }

    /**
     * @notice Register multiple rewards in one call (owner only).
     * @param _beneficiaries Reward recipient addresses.
     * @param _amounts Reward amounts in token base units.
     */
    function addRewards(address[] calldata _beneficiaries, uint256[] calldata _amounts)
        external
        onlyOwner
    {
        require(_beneficiaries.length == _amounts.length, "Arrays length mismatch");
        require(_beneficiaries.length > 0, "Empty arrays");
        for (uint256 i = 0; i < _beneficiaries.length; i++) {
            _addReward(_beneficiaries[i], _amounts[i]);
        }
    }

    function _addReward(address _beneficiary, uint256 _amount) private {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(_amount > 0, "Amount must be greater than 0");
        require(!rewards[_beneficiary].claimed, "Reward already claimed");
        require(!rewards[_beneficiary].isActive, "Reward already exists");

        rewards[_beneficiary] = Reward({
            beneficiary: _beneficiary,
            totalAmount: _amount,
            claimed: false,
            isActive: true
        });
        beneficiaries.add(_beneficiary);
        totalRewardAmount += _amount;
        emit RewardAdded(_beneficiary, _amount);
    }

    /**
     * @notice Returns all currently active beneficiary addresses.
     */
    function getBeneficiaries() external view returns (address[] memory) {
        return beneficiaries.values();
    }

    /**
     * @notice Claim the full reward. Callable once per beneficiary.
     */
    function claim() external nonReentrant {
        Reward storage r = rewards[msg.sender];
        require(r.isActive, "No active reward");
        require(!r.claimed, "Already claimed");

        uint256 amount = r.totalAmount;
        r.claimed = true;

        hppToken.safeTransfer(msg.sender, amount);

        emit RewardClaimed(msg.sender, amount);
    }

    /**
     * @notice Returns the remaining claimable amount for a beneficiary.
     *         Equals totalAmount if active and unclaimed; otherwise 0.
     */
    function getClaimableAmount(address _beneficiary) public view returns (uint256) {
        Reward storage r = rewards[_beneficiary];
        if (!r.isActive || r.claimed) {
            return 0;
        }
        return r.totalAmount;
    }

    /**
     * @notice Returns the Reward struct for a beneficiary.
     */
    function getReward(address _beneficiary) external view returns (Reward memory) {
        return rewards[_beneficiary];
    }

    /**
     * @notice Revoke an active unclaimed reward (owner only). Frees the slot so the
     *         same address can be re-registered, while claimed addresses remain locked.
     */
    function revokeReward(address _beneficiary) external onlyOwner {
        Reward storage r = rewards[_beneficiary];
        require(r.isActive && !r.claimed, "No active reward");

        totalRewardAmount -= r.totalAmount;
        r.isActive = false;
        beneficiaries.remove(_beneficiary);

        emit RewardRevoked(_beneficiary);
    }

    /**
     * @notice Withdraw a specified amount of tokens to the owner (emergency use).
     */
    function emergencyWithdraw(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Amount must be greater than 0");
        require(_amount <= hppToken.balanceOf(address(this)), "Insufficient balance");
        hppToken.safeTransfer(owner(), _amount);
    }

    /**
     * @notice Withdraw the entire token balance to the owner (emergency use).
     */
    function emergencyWithdrawAll() external onlyOwner {
        uint256 balance = hppToken.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        hppToken.safeTransfer(owner(), balance);
    }
}
