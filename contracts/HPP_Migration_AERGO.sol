// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AergoHPPSwap
 * @dev Contract for secure 1:1 exchange between AERGO and HPP tokens.
 * This contract provides functionality for users to swap between tokens
 * and for owners(multisig) to manage liquidity.
 * @custom:security-contact security@hpp.io
 */
contract AergoHPPSwap is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;
    
    // Custom Errors
    error ZeroAddress();
    error SameTokenAddress();
    error ZeroAmount();
    
    /**
     * @dev Reference to the AERGO token contract
     */
    IERC20 public immutable AERGO;
    
    /**
     * @dev Reference to the HPP token contract
     */
    IERC20 public immutable HPP;

    // Burn address
    address constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    /**
     * @dev Emitted when a user swaps tokens
     * @param user Address of the user performing the swap
     * @param fromToken Address of the token being swapped from
     * @param toToken Address of the token being swapped to
     * @param amount Amount of tokens being swapped
     */
    event Swap(address indexed user, address indexed fromToken, address indexed toToken, uint256 amount);
    
    /**
     * @dev Emitted when liquidity is removed from the contract
     * @param token Address of the token for which liquidity was removed
     * @param amount Amount of tokens removed
     */
    event LiquidityRemoved(address indexed token, uint256 amount);

    /**
     * @dev Emitted when AERGO tokens are burned by sending to the burn address
     * @param amount Amount of AERGO tokens burned
     */
    event AergoBurned(uint256 amount);
    
    /**
     * @dev Sets the token addresses and initial owner
     * @param _aergoToken Address of the AERGO token contract
     * @param _hppToken Address of the HPP token contract
     * @param _initialOwner Address of the initial contract owner
     */
    constructor(
        address _aergoToken, 
        address _hppToken, 
        address _initialOwner
    ) Ownable(_initialOwner) {
        if (_aergoToken == address(0)) revert ZeroAddress();
        if (_hppToken == address(0)) revert ZeroAddress();
        if (_aergoToken == _hppToken) revert SameTokenAddress();
        
        AERGO = IERC20(_aergoToken);
        HPP = IERC20(_hppToken);
    }
    
    /**
     * @dev Swaps AERGO tokens for HPP tokens at 1:1 ratio
     * @param amount Amount of AERGO to swap
     */
    function swapAergoForHPP(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        require(HPP.balanceOf(address(this)) >= amount, "Insufficient HPP liquidity");

        AERGO.safeTransferFrom(msg.sender, address(this), amount);
        HPP.safeTransfer(msg.sender, amount);
        
        emit Swap(msg.sender, address(AERGO), address(HPP), amount);
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
     * @dev Burns AERGO tokens by sending them to a dead address (owner only)
     * @param amount Amount of AERGO tokens to burn
     * @notice This action is irreversible and permanently removes tokens from circulation
     * @notice Protected by nonReentrant modifier to prevent reentrancy attacks
     */
    function burnAergo(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 balance = AERGO.balanceOf(address(this));
        require(balance >= amount, "Insufficient balance");

        AERGO.safeTransfer(BURN_ADDRESS, amount);

        emit AergoBurned(amount);
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