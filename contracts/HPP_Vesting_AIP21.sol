// Incentive program for AIP-21 voters (HPP Vesting - AIP 21)
// Details : https://medium.com/aergo/hpp-aip-21-building-a-value-aligned-layer-2-ecosystem-through-governance-and-incentives-5bdd3df27cf2

// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HPP_Vesting_AIP21
 * @notice 24-month vesting program for AIP-21 voters
 * @dev Secure vesting implementation using OpenZeppelin VestingWallet
 */
contract HPP_Vesting_AIP21 is Ownable, ReentrancyGuard {
    
    /// @notice Vesting schedule information
    struct VestingSchedule {
        address beneficiary;        // Vesting recipient address
        uint256 totalAmount;        // Total vesting amount
        uint256 claimedAmount;      // Already claimed amount
        uint256 startTime;          // Vesting start time
        uint256 duration;           // Vesting duration (24 months = 730 days)
        bool isActive;              // Whether vesting is active
    }
    
    /// @notice HPP token contract
    ERC20 public immutable hppToken;
    
    /// @notice Vesting start time (based on TGE)
    uint256 public vestingStartTime;
    
    /// @notice Vesting duration (24 months)
    uint256 public constant VESTING_DURATION = 730 days; // 24 months
    
    /// @notice Vesting schedule mapping
    mapping(address => VestingSchedule) public vestingSchedules;
    
    /// @notice List of vesting beneficiaries
    address[] public beneficiaries;
    
    /// @notice Total vesting token amount
    uint256 public totalVestingAmount;
    
    /// @notice Whether vesting has started
    bool public vestingStarted;
    
    /// @notice Event emitted when a vesting schedule is added
    event VestingScheduleAdded(address indexed beneficiary, uint256 amount, uint256 startTime);
    
    /// @notice Event emitted when tokens are claimed
    event TokensClaimed(address indexed beneficiary, uint256 amount);
    
    /// @notice Event emitted when vesting starts
    event VestingStarted(uint256 startTime);
    
    /// @notice Event emitted when a vesting schedule is revoked
    event VestingScheduleRevoked(address indexed beneficiary);
    
    /**
     * @notice Contract constructor
     * @param _hppToken HPP token contract address
     * @param _initialOwner Contract owner address
     */
    constructor(address _hppToken, address _initialOwner) Ownable(_initialOwner) {
        require(_hppToken != address(0), "Invalid token address");
        require(_initialOwner != address(0), "Invalid owner address");
        
        hppToken = ERC20(_hppToken);
    }
    
    /**
     * @notice Start vesting (based on TGE)
     * @dev Only callable by the owner
     */
    function startVesting() external onlyOwner {
        require(!vestingStarted, "Vesting already started");
        require(vestingStartTime == 0, "Vesting start time already set");
        
        vestingStartTime = block.timestamp;
        vestingStarted = true;
        
        emit VestingStarted(vestingStartTime);
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
            startTime: vestingStartTime,
            duration: VESTING_DURATION,
            isActive: true
        });
        beneficiaries.push(_beneficiary);
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
        require(vestingStarted, "Vesting not started yet");
        
        uint256 claimableAmount = getClaimableAmount(msg.sender);
        require(claimableAmount > 0, "No tokens to claim");
        
        schedule.claimedAmount += claimableAmount;
        
        require(hppToken.transfer(msg.sender, claimableAmount), "Token transfer failed");
        
        emit TokensClaimed(msg.sender, claimableAmount);
    }
    
    /**
     * @notice Calculate the claimable token amount for a specific address
     * @param _beneficiary Vesting recipient address
     * @return Claimable token amount
     */
    function getClaimableAmount(address _beneficiary) public view returns (uint256) {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        
        if (!schedule.isActive || !vestingStarted) {
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
        if (block.timestamp < schedule.startTime) {
            return 0;
        }
        
        if (block.timestamp >= schedule.startTime + schedule.duration) {
            return schedule.totalAmount;
        }
        
        // Linear vesting calculation (distributed evenly every month)
        return (schedule.totalAmount * (block.timestamp - schedule.startTime)) / schedule.duration;
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
        return beneficiaries;
    }
    
    /**
     * @notice Revoke a vesting schedule (for emergency use)
     * @param _beneficiary Vesting recipient address
     * @dev Only callable by the owner
     */
    function revokeVestingSchedule(address _beneficiary) external onlyOwner {
        require(vestingSchedules[_beneficiary].isActive, "No active vesting schedule");
        
        vestingSchedules[_beneficiary].isActive = false;
        
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
        
        require(hppToken.transfer(owner(), _amount), "Token transfer failed");
    }
    
    /**
     * @notice Withdraw all remaining tokens from the contract (for emergency use)
     * @dev Only callable by the owner
     */
    function emergencyWithdrawAll() external onlyOwner {
        uint256 balance = hppToken.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        require(hppToken.transfer(owner(), balance), "Token transfer failed");
    }
}
