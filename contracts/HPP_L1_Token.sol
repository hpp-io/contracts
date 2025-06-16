// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title House Party Protocol Token (HPP)
/// @notice Implements the HPP ERC20 token with pause, and permit features.
/// @custom:security-contact security@aergo.io
contract HousePartyProtocol is ERC20, ERC20Burnable, ERC20Pausable, Ownable, ERC20Permit {
    /// @notice Role identifier granting permission to pause and unpause the contract.
    /// @dev Keccak256 hash of "PAUSER_ROLE".
    
    /// @notice Contract constructor
    /// @dev Initializes the token and mints the total supply to the recipient address
    /// @param recipient Address that will receive the initial token supply
    /// @param initialOwner Address that will become the contract owner
    constructor(address recipient, address initialOwner)
        ERC20("HousePartyProtocol", "HPP")
        Ownable(initialOwner)
        ERC20Permit("HousePartyProtocol")
    {
        // Mint 1.7 billion HPP tokens to the recipient address
        // decimals() returns 18 by default according to the ERC20 standard
        _mint(recipient, 1700000000 * 10 ** decimals());
    }

    /// @notice Pauses token transfer functionality
    /// @dev Can only be called by the contract owner
    function pause() public onlyOwner {
        _pause();
    }

    /// @notice Unpauses token transfer functionality
    /// @dev Can only be called by the contract owner
    function unpause() public onlyOwner {
        _unpause();
    }

    // The following functions are overrides required by Solidity.

    /// @notice Overrides the internal token transfer function
    /// @dev Calls the _update function from both ERC20 and ERC20Pausable contracts
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, value);
    }
}