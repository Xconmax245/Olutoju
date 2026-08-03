// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockVault {
    uint256 public healthFactor; // scaled by 100 (e.g., 150 = 1.50)
    
    event HealthFactorDegraded(uint256 newHealthFactor);
    event CollateralToppedUp(uint256 newHealthFactor);
    
    constructor() {
        healthFactor = 150; // default 1.50
    }
    
    function triggerChaos() external {
        healthFactor = 105; // Drop to 1.05 (Danger)
        emit HealthFactorDegraded(healthFactor);
    }
    
    function topUpCollateral() external {
        healthFactor = 150; // Restore to 1.50 (Safe)
        emit CollateralToppedUp(healthFactor);
    }
}
