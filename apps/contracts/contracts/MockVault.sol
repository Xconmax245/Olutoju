// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * MockVault — a demo lending position whose health factor can be degraded
 * (chaos) and defended (escalating workflow). It supports the full Sentinel
 * Mesh defense escalation path:
 *
 *   topUpCollateral  (restore)  -> partialUnwind (reduce) -> pausePosition (halt)
 *
 * plus a "block primary defense" switch so the chaos showcase can FORCE the
 * first defensive step to fail its simulation, proving the agent re-plans and
 * escalates to the next step rather than silently retrying the same call.
 */
contract MockVault {
    uint256 public healthFactor;      // scaled by 100 (e.g., 150 = 1.50)
    bool public paused;               // true once pausePosition() lands
    bool public blockPrimaryDefense;  // when true, topUpCollateral() reverts (forces escalation)

    event HealthFactorDegraded(uint256 newHealthFactor);
    event CollateralToppedUp(uint256 newHealthFactor);
    event PositionPartiallyUnwound(uint256 newHealthFactor);
    event PositionPaused();
    event PrimaryDefenseBlockSet(bool blocked);

    constructor() {
        healthFactor = 150; // default 1.50 (Safe)
    }

    // ----------------------------------------------------------------------
    // Chaos controls (demo-only, called by the treasury signer)
    // ----------------------------------------------------------------------

    /// Drop health factor into the danger zone.
    function triggerChaos() external {
        healthFactor = 105; // 1.05 (Danger)
        emit HealthFactorDegraded(healthFactor);
    }

    /// Force the primary defense (topUpCollateral) to revert so the agent must
    /// escalate to partialUnwind. Set false to restore normal behaviour.
    function setBlockPrimaryDefense(bool blocked) external {
        blockPrimaryDefense = blocked;
        emit PrimaryDefenseBlockSet(blocked);
    }

    // ----------------------------------------------------------------------
    // Defense escalation path (routed through KeeperHub Direct Execution)
    // ----------------------------------------------------------------------

    /// Step 1 (restore): fully top up collateral back to safe.
    function topUpCollateral() external {
        require(!blockPrimaryDefense, "primary defense blocked");
        healthFactor = 150; // 1.50 (Safe)
        paused = false;
        emit CollateralToppedUp(healthFactor);
    }

    /// Step 2 (reduce): partial unwind — lifts HF out of danger but not fully.
    function partialUnwind() external {
        require(healthFactor < 150, "position already safe");
        healthFactor = 130; // 1.30 (Safe-ish)
        emit PositionPartiallyUnwound(healthFactor);
    }

    /// Step 3 (halt): pause the position to stop further borrowing.
    function pausePosition() external {
        paused = true;
        if (healthFactor < 120) {
            healthFactor = 120; // 1.20 — halted but stabilized
        }
        emit PositionPaused();
    }
}
