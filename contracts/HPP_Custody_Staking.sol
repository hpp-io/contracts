// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title HPP Custody Staking (Contract -> Custody)
 * @notice
 *  - Staking: Deposit from user -> contract, then immediately transfer from contract -> custody in the same transaction
 *  - Unstaking: Per-request cooldown (can limit the number of requests)
 *  - Withdrawal: Transfer expired cooldown tokens from custody -> user (custody must pre-approve allowance to this contract)
 *
 * Security:
 *  - OpenZeppelin: SafeERC20, ReentrancyGuard, Pausable, Ownable2Step
 *  - Rescue accidentally sent tokens
 *  - Two-step custody wallet change (propose -> accept)
 *  - Two-step owner wallet change (propose -> accept)
 *  - All external transfers use SafeERC20
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract HPPCustodyStaking is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ───────────── Errors ─────────────
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientStake();
    error CooldownNotFinished();
    error PendingCustodyChangeNone();
    error InsufficientCustodyAllowance(uint256 required, uint256 current);
    error MaxCooldownEntriesReached(uint256 current, uint256 maxAllowed);
    error InvalidCooldownIndex();
    error OwnershipRenouncementDisabled();

    // ───────────── Events ─────────────
    event Staked(address indexed user, uint256 amount, address indexed custody);
    event CustodyReceived(uint256 amount, address indexed custody);
    event UnstakeRequested(address indexed user, uint256 amount, uint256 unlockTime);
    event Withdrawn(address indexed user, uint256 amount, address indexed custody);
    event CooldownDurationUpdated(uint256 oldVal, uint256 newVal);
    event CustodyChangeProposed(address indexed oldCustody, address indexed newCustody);
    event CustodyChanged(address indexed oldCustody, address indexed newCustody);
    event Rescue(address indexed token, address indexed to, uint256 amount);
    event MaxGlobalCooldownEntriesUpdated(uint16 oldVal, uint16 newVal);
    event CooldownArrayCompacted(address indexed user, uint256 newLength);

    // ───────────── Storage ─────────────
    IERC20 public immutable stakingToken;   // Token to be staked (HPP)
    address public custodyWallet;           // Wallet that actually holds the tokens
    address public pendingCustodyWallet;    // For two-step custody change

    uint256 public cooldownDuration;        // Example: 1/sec
    uint256 public totalStaked;             // Total staking accounting (not contract balance)
    mapping(address => uint256) public stakedBalance; // User staking balance

    // Global cooldown entry limit (applied equally to all users)
    uint16 public maxGlobalCooldownEntries = 50;

    struct Cooldown {
        uint256 amount;
        uint256 unlockTime;
    }
    
    // Cooldown management structure
    mapping(address => Cooldown[]) private _cooldowns;
    mapping(address => uint256) private _firstValidIndex; // First valid index for each user

    // ───────────── Constructor ─────────────
    constructor(address _token, address _custody, uint256 _cooldownDuration) Ownable(msg.sender) {
        if (_token == address(0) || _custody == address(0)) revert ZeroAddress();
        stakingToken = IERC20(_token);
        custodyWallet = _custody;
        cooldownDuration = _cooldownDuration;
    }

    // ───────────── Admin / Config ─────────────
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Change cooldown duration
    function setCooldownDuration(uint256 newDuration) external onlyOwner {
        emit CooldownDurationUpdated(cooldownDuration, newDuration);
        cooldownDuration = newDuration;
    }

    /// @notice Change global cooldown entry limit (Owner configurable)
    function setMaxGlobalCooldownEntries(uint16 newMax) external onlyOwner {
        if (newMax == 0) revert ZeroAmount();
        emit MaxGlobalCooldownEntriesUpdated(maxGlobalCooldownEntries, newMax);
        maxGlobalCooldownEntries = newMax;
    }

    /// @notice Get current global unstaking request maximum count
    function getMaxGlobalCooldownEntries() external view returns (uint16) {
        return maxGlobalCooldownEntries;
    }

    /// @notice Propose custody wallet change (step 1)
    function proposeCustodyWallet(address newCustody) external onlyOwner {
        if (newCustody == address(0)) revert ZeroAddress();
        pendingCustodyWallet = newCustody;
        emit CustodyChangeProposed(custodyWallet, newCustody);
    }

    /// @notice Accept custody wallet change (step 2)
    function acceptCustodyWallet() external {
        address next = pendingCustodyWallet;
        if (next == address(0)) revert PendingCustodyChangeNone();
        if (msg.sender != next) revert("ONLY_PENDING_CUSTODY_CAN_ACCEPT");
        
        address old = custodyWallet;
        custodyWallet = next;
        pendingCustodyWallet = address(0);
        emit CustodyChanged(old, next);
    }

    /// @notice Recover tokens accidentally sent to the contract
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit Rescue(token, to, amount);
    }

    /// @notice Disable ownership renouncement    
    function renounceOwnership() public view override onlyOwner {
        revert OwnershipRenouncementDisabled();
    }

    // ───────────── Stake ─────────────
    /**
     * @notice Staking: user -> contract -> custody (same transaction)
     * @dev User must first approve stakingToken.approve()
     */
    function stake(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        // 1) user -> contract
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        // 2) Update accounting (after deposit is confirmed)
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;

        // 3) contract -> custody (immediate transfer)
        stakingToken.safeTransfer(custodyWallet, amount);

        emit Staked(msg.sender, amount, custodyWallet);
        emit CustodyReceived(amount, custodyWallet);
    }
    
    // ───────────── Unstake ─────────────
    /**
     * @notice Unstaking request (start cooldown). Per-Request Cooldown timer.
     * @dev Limited by maxGlobalCooldownEntries for simultaneous requests.
     */
    function unstake(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (stakedBalance[msg.sender] < amount) revert InsufficientStake();

        // Calculate valid cooldown items count (excluding deleted items)
        uint256 validCount = _cooldowns[msg.sender].length - _firstValidIndex[msg.sender];
        if (validCount >= maxGlobalCooldownEntries) {
            revert MaxCooldownEntriesReached(validCount, maxGlobalCooldownEntries);
        }

        stakedBalance[msg.sender] -= amount;
        totalStaked -= amount;

        uint256 unlockTime = block.timestamp + cooldownDuration;
        _cooldowns[msg.sender].push(Cooldown({amount: amount, unlockTime: unlockTime}));

        emit UnstakeRequested(msg.sender, amount, unlockTime);
    }

    // ───────────── Withdraw ─────────────
    /**
     * @notice Withdraw expired cooldown tokens from custody -> user (all expired items)
     * @return withdrawn Total amount actually withdrawn
     * @dev custodyWallet must pre-execute stakingToken.approve(address(this), N)
     */
    function withdraw() external whenNotPaused nonReentrant returns (uint256 withdrawn) {
        Cooldown[] storage list = _cooldowns[msg.sender];
        uint256 firstIdx = _firstValidIndex[msg.sender];
        uint256 n = list.length;
        
        if (firstIdx >= n) return 0; // All items already processed

        uint256 nowTs = block.timestamp;
        uint256 toTransfer;
        uint256 lastProcessedIdx = firstIdx;

        // Find completed cooldown items
        for (uint256 i = firstIdx; i < n; ) {
            Cooldown memory cd = list[i];
            if (cd.unlockTime > nowTs) break;
            toTransfer += cd.amount;
            lastProcessedIdx = i + 1; // Update next valid index
            unchecked { i++; }
        }

        if (toTransfer == 0) revert CooldownNotFinished();

        // Check allowance
        uint256 allowance = stakingToken.allowance(custodyWallet, address(this));
        if (allowance < toTransfer) revert InsufficientCustodyAllowance(toTransfer, allowance);

        // Transfer tokens
        stakingToken.safeTransferFrom(custodyWallet, msg.sender, toTransfer);
        
        // Update first valid index (array items remain unchanged)
        _firstValidIndex[msg.sender] = lastProcessedIdx;

        // Automatically compact the array if it gets too long (optional optimization)
        if (lastProcessedIdx > 10 && lastProcessedIdx > n / 2) {
            _compactCooldownArray(msg.sender);
        }

        emit Withdrawn(msg.sender, toTransfer, custodyWallet);
        return toTransfer;
    }

    /// @notice Compact cooldown array function
    function compactCooldownArray() external {
        _compactCooldownArray(msg.sender);
    }
    
    /// @dev Internal function: Compact cooldown array
    function _compactCooldownArray(address user) internal {
        Cooldown[] storage list = _cooldowns[user];
        uint256 firstIdx = _firstValidIndex[user];
        uint256 n = list.length;
        
        if (firstIdx == 0 || firstIdx >= n) return;
        
        // Move valid items to the front
        uint256 j = 0;
        for (uint256 i = firstIdx; i < n; ) {
            list[j] = list[i];
            unchecked { 
                i++; 
                j++;
            }
        }
        
        // Remove remaining items
        uint256 newLength = n - firstIdx;
        while (list.length > newLength) {
            list.pop();
        }
        
        // Reset first valid index
        _firstValidIndex[user] = 0;
        
        emit CooldownArrayCompacted(user, newLength);
    }

    // ───────────── Views ─────────────
    /// @notice Get total cooldown items count for a specific user
    function cooldownCount(address user) external view returns (uint256) {
        return _cooldowns[user].length - _firstValidIndex[user];
    }

    /// @notice Get cooldown info (amount, unlockTime) for a specific index
    function getCooldown(address user, uint256 relativeIndex) external view returns (uint256 amount, uint256 unlockTime) {
        uint256 firstIdx = _firstValidIndex[user];
        uint256 actualIndex = relativeIndex + firstIdx;
        
        if (actualIndex >= _cooldowns[user].length) revert InvalidCooldownIndex();
        
        Cooldown memory cd = _cooldowns[user][actualIndex];
        return (cd.amount, cd.unlockTime);
    }

    /// @notice Get total withdrawable amount at current time (only consecutive unlocked items)
    function withdrawableNow(address user) external view returns (uint256 sum) {
        Cooldown[] storage list = _cooldowns[user];
        uint256 firstIdx = _firstValidIndex[user];
        uint256 n = list.length;
        uint256 nowTs = block.timestamp;
        
        for (uint256 i = firstIdx; i < n; ) {
            if (list[i].unlockTime > nowTs) break;
            sum += list[i].amount;
            unchecked { i++; }
        }
    }

    /// @notice Get total pending unwithdrawn amount (sum of all cooldowns)
    function pendingUnwithdrawn(address user) external view returns (uint256 sum) {
        Cooldown[] storage list = _cooldowns[user];
        uint256 firstIdx = _firstValidIndex[user];
        uint256 n = list.length;
        
        for (uint256 i = firstIdx; i < n; ) {
            sum += list[i].amount;
            unchecked { i++; }
        }
    }
    
    /// @notice Check internal state of cooldown array (for debugging)
    function getCooldownArrayInfo(address user) external view returns (
        uint256 totalLength, 
        uint256 firstValidIndex, 
        uint256 validCount
    ) {
        totalLength = _cooldowns[user].length;
        firstValidIndex = _firstValidIndex[user];
        validCount = totalLength > firstValidIndex ? totalLength - firstValidIndex : 0;
    }
}