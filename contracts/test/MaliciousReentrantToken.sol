// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IClaimable {
    function claim() external;
}

/**
 * @title MaliciousReentrantToken
 * @notice TEST-ONLY ERC20. On `transfer`, calls `claim()` back into the configured
 *         target contract to verify ReentrancyGuard blocks re-entry.
 */
contract MaliciousReentrantToken is ERC20 {
    address public target;
    bool public attackArmed;

    constructor() ERC20("Malicious", "MAL") {
        _mint(msg.sender, 1_000_000 ether);
    }

    function setTarget(address _target) external {
        target = _target;
    }

    function arm() external {
        attackArmed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (attackArmed && from == target && to != address(0)) {
            attackArmed = false; // single-shot to avoid infinite loop in revert path
            IClaimable(target).claim();
        }
    }
}
