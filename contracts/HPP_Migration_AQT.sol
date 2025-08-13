// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AQTtoHPPMigration
 * @dev Contract for migrating AQT tokens to HPP tokens at a fixed rate of 1:7.43026
 * This contract only accepts whole AQT tokens (no decimals) for migration
 * Owners(multisig) can manage liquidity and burn AQT tokens.
 * @custom:security-contact security@hpp.io
 */
contract AQTtoHPPMigration is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;
    
    // Custom Errors
    error ZeroAddress();
    error SameTokenAddress();
    error ZeroAmount();
    error DecimalsNotAllowed();
    error InsufficientHPPLiquidity();
    
    /**
     * @dev Reference to the AQT token contract
     */
    IERC20 public immutable AQT;
    
    /**
     * @dev Reference to the HPP token contract
     */
    IERC20 public immutable HPP;

    /**
     * @dev Migration rate: 1 AQT = 7.43026 HPP
     * Using 18 decimals precision: 7430260000000000000
     */
    uint256 public constant MIGRATION_RATE = 7430260000000000000;
    
    // Burn address
    address constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    
    /**
     * @dev Emitted when a user migrates tokens
     * @param user Address of the user performing the migration
     * @param aqtAmount Amount of AQT tokens migrated
     * @param hppAmount Amount of HPP tokens received
     */
    event TokensMigrated(
        address indexed user, 
        uint256 aqtAmount, 
        uint256 hppAmount
    );

    /**
     * @dev Emitted when AQT tokens are burned by sending to the burn address
     * @param amount Amount of AQT tokens burned
     */
    event AQTBurned(uint256 amount);
    
    
    /**
     * @dev Emitted when liquidity is removed from the contract
     * @param token Address of the token for which liquidity was removed
     * @param amount Amount of tokens removed
     */
    event LiquidityRemoved(address indexed token, uint256 amount);
    
    /**
     * @dev Sets the token addresses and initial owner
     * @param _aqtToken Address of the AQT token contract
     * @param _hppToken Address of the HPP token contract
     * @param _initialOwner Address of the initial contract owner
     */
    constructor(
        address _aqtToken, 
        address _hppToken, 
        address _initialOwner
    ) Ownable(_initialOwner) {
        if (_aqtToken == address(0)) revert ZeroAddress();
        if (_hppToken == address(0)) revert ZeroAddress();
        if (_aqtToken == _hppToken) revert SameTokenAddress();
        
        AQT = IERC20(_aqtToken);
        HPP = IERC20(_hppToken);
    }
    
    /**
     * @dev Migrates whole AQT tokens to HPP tokens at 1:7.43026 ratio
     * @param aqtAmount Amount of AQT to migrate (must be whole tokens, no decimals)
     */
    function migrateAQTtoHPP(uint256 aqtAmount) external nonReentrant whenNotPaused {
        if (aqtAmount == 0) revert ZeroAmount();
        
        // Check if amount has decimals (must be whole tokens only)
        if (aqtAmount % (10 ** 18) != 0) {
            revert DecimalsNotAllowed();
        }
        
        // Calculate HPP amount to receive
        // aqtAmount is in wei, so we divide by 10^18 to get token count,
        // then multiply by MIGRATION_RATE
        uint256 hppAmount = (aqtAmount * MIGRATION_RATE) / (10 ** 18);
        
        // Check HPP liquidity
        if (HPP.balanceOf(address(this)) < hppAmount) {
            revert InsufficientHPPLiquidity();
        }

        // Transfer AQT from user to contract
        AQT.safeTransferFrom(msg.sender, address(this), aqtAmount);
        
        // Transfer HPP to user
        HPP.safeTransfer(msg.sender, hppAmount);
        
        emit TokensMigrated(msg.sender, aqtAmount, hppAmount);
    }
    
    /**
     * @dev Removes liquidity from the contract (owner only)
     * @param tokenAddress Address of the token to remove
     * @param amount Amount of tokens to remove
     */
    function removeLiquidity(address tokenAddress, uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        
        IERC20 token = IERC20(tokenAddress);
        token.safeTransfer(msg.sender, amount);
        
        emit LiquidityRemoved(tokenAddress, amount);
    }

    /**
     * @dev Burns AQT tokens by sending them to a dead address (owner only)
     * @param amount Amount of AQT tokens to burn
     * @notice This action is irreversible and permanently removes tokens from circulation
     * @notice Protected by nonReentrant modifier to prevent reentrancy attacks
     */
    function burnAQT(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 balance = AQT.balanceOf(address(this));
        require(balance >= amount, "Insufficient balance");

        AQT.safeTransfer(BURN_ADDRESS, amount);

        emit AQTBurned(amount);
    }

    /**
     * @dev Pauses the contract operations (owner only)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpauses the contract operations (owner only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}