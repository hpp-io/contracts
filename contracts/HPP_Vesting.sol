// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HPP_Vesting
 * @notice Linear vesting contract for token distribution programs
 * @dev Reusable vesting contract with configurable start time and duration.
 *      Supports multiple beneficiaries with individual vesting schedules.
 *      Tokens are vested linearly over the specified duration from the start time.
 */
contract HPP_Vesting is Ownable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;
    
    /// @notice Vesting schedule information
    struct VestingSchedule {
        address beneficiary;        // Vesting recipient address
        uint256 totalAmount;        // Total vesting amount
        uint256 claimedAmount;      // Already claimed amount
        bool isActive;              // Whether vesting is active
    }
    
    /// @notice HPP token contract
    IERC20 public immutable hppToken;
    
    /// @notice Vesting start time (Unix timestamp in seconds)
    uint256 public immutable vestingStartTime;
    
    /// @notice Vesting duration (in seconds)
    uint256 public immutable vestingDuration;
    
    /// @notice Vesting name/identifier
    string public vestingName;
    
    /// @notice Vesting schedule mapping
    mapping(address => VestingSchedule) public vestingSchedules;

    /// @notice Set of vesting beneficiaries (no duplicates)
    EnumerableSet.AddressSet private beneficiaries;
    
    /// @notice Total assigned amount = claimed + unclaimed (across active obligations)
    uint256 public totalVestingAmount;
    
    /// @notice Event emitted when a vesting schedule is added
    event VestingScheduleAdded(address indexed beneficiary, uint256 amount, uint256 startTime);
    
    /// @notice Event emitted when tokens are claimed
    event TokensClaimed(address indexed beneficiary, uint256 amount);
    
    /// @notice Event emitted when a vesting schedule is revoked
    event VestingScheduleRevoked(address indexed beneficiary);

    /**
     * @notice Contract constructor
     * @param _hppToken HPP token contract address
     * @param _initialOwner Contract owner address (can add/revoke schedules)
     * @param _vestingStartTime Vesting start time (Unix timestamp in seconds)
     * @param _vestingDuration Vesting duration in seconds (e.g., 730 days = 63072000)
     * @param _vestingName Vesting name/identifier
     */
    constructor(
        address _hppToken,
        address _initialOwner,
        uint256 _vestingStartTime,
        uint256 _vestingDuration,
        string memory _vestingName
    ) Ownable(_initialOwner) {
        require(_hppToken != address(0), "Invalid token address");
        require(_initialOwner != address(0), "Invalid owner address");
        require(_vestingStartTime > 0, "Invalid vesting start time");
        require(_vestingDuration > 0, "Invalid vesting duration");
        
        hppToken = IERC20(_hppToken);
        vestingStartTime = _vestingStartTime;
        vestingDuration = _vestingDuration;
        vestingName = _vestingName;
    }
    
    /**
     * @notice Add a vesting schedule
     * @param _beneficiary Vesting recipient address
     * @param _amount Vesting token amount
     * @dev Only callable by the owner
     */
    function addVestingSchedule(address _beneficiary, uint256 _amount) external onlyOwner {
        _addVestingSchedule(_beneficiary, _amount);
    }
    
    function _addVestingSchedule(address _beneficiary, uint256 _amount) private {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(_amount > 0, "Amount must be greater than 0");
        require(!vestingSchedules[_beneficiary].isActive, "Vesting schedule already exists");
        vestingSchedules[_beneficiary] = VestingSchedule({
            beneficiary: _beneficiary,
            totalAmount: _amount,
            claimedAmount: 0,
            isActive: true
        });
        beneficiaries.add(_beneficiary);
        totalVestingAmount += _amount;
        emit VestingScheduleAdded(_beneficiary, _amount, vestingStartTime);
    }
    
    /**
     * @notice Add multiple vesting schedules at once
     * @param _beneficiaries Array of vesting recipient addresses
     * @param _amounts Array of vesting token amounts
     * @dev Only callable by the owner
     */
    function addVestingSchedules(address[] calldata _beneficiaries, uint256[] calldata _amounts) external onlyOwner {
        require(_beneficiaries.length == _amounts.length, "Arrays length mismatch");
        require(_beneficiaries.length > 0, "Empty arrays");
        for (uint256 i = 0; i < _beneficiaries.length; i++) {
            _addVestingSchedule(_beneficiaries[i], _amounts[i]);
        }
    }
    
    /**
     * @notice Claim vested tokens
     * @dev Only callable by the vesting beneficiary
     */
    function claimTokens() external nonReentrant {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        require(schedule.isActive, "No active vesting schedule");
        require(block.timestamp >= vestingStartTime, "Vesting not started yet");
        
        uint256 claimableAmount = getClaimableAmount(msg.sender);
        require(claimableAmount > 0, "No tokens to claim");

        schedule.claimedAmount += claimableAmount;
        
        hppToken.safeTransfer(msg.sender, claimableAmount);
        
        emit TokensClaimed(msg.sender, claimableAmount);
    }
    
    /**
     * @notice Calculate the claimable token amount for a specific address
     * @param _beneficiary Vesting recipient address
     * @return Claimable token amount
     */
    function getClaimableAmount(address _beneficiary) public view returns (uint256) {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        
        if (!schedule.isActive) {
            return 0;
        }
        
        uint256 totalVested = _getVestedAmount(schedule);
        return totalVested - schedule.claimedAmount;
    }
    
    /**
     * @notice Calculate the vested token amount (using OpenZeppelin VestingWallet logic)
     * @param schedule Vesting schedule
     * @return Vested token amount
     */
    function _getVestedAmount(VestingSchedule storage schedule) internal view returns (uint256) {
        if (block.timestamp < vestingStartTime) {
            return 0;
        }
        
        if (block.timestamp >= vestingStartTime + vestingDuration) {
            return schedule.totalAmount;
        }
        
        // Linear vesting calculation (proportional to elapsed time)
        return (schedule.totalAmount * (block.timestamp - vestingStartTime)) / vestingDuration;
    }
    
    /**
     * @notice Get vesting schedule information
     * @param _beneficiary Vesting recipient address
     * @return Vesting schedule information
     */
    function getVestingSchedule(address _beneficiary) external view returns (VestingSchedule memory) {
        return vestingSchedules[_beneficiary];
    }
    
    /**
     * @notice Get all vesting beneficiaries
     * @return Array of vesting beneficiary addresses
     */
    function getBeneficiaries() external view returns (address[] memory) {
        return beneficiaries.values();
    }
    
    /**
     * @notice Revoke a vesting schedule (for emergency use)
     * @param _beneficiary Vesting recipient address
     * @dev Only callable by the owner
     */
    function revokeVestingSchedule(address _beneficiary) external onlyOwner {
        require(vestingSchedules[_beneficiary].isActive, "No active vesting schedule");
        VestingSchedule storage s = vestingSchedules[_beneficiary];
        uint256 total = s.totalAmount;
        if (total > 0) {
            totalVestingAmount -= total;
        }
        s.isActive = false;
        
        emit VestingScheduleRevoked(_beneficiary);
    }

    
    
    /**
     * @notice Withdraw remaining tokens from the contract (for emergency use)
     * @param _amount Amount of tokens to withdraw
     * @dev Only callable by the owner
     */
    function emergencyWithdraw(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Amount must be greater than 0");
        require(_amount <= hppToken.balanceOf(address(this)), "Insufficient balance");
        
        hppToken.safeTransfer(owner(), _amount);
    }
    
    /**
     * @notice Withdraw all remaining tokens from the contract (for emergency use)
     * @dev Only callable by the owner
     */
    function emergencyWithdrawAll() external onlyOwner {
        uint256 balance = hppToken.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        hppToken.safeTransfer(owner(), balance);
    }
}
