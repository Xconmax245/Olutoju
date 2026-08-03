/**
 * Detection & Position layer (P0.5 / §4).
 *
 * Detection is deliberately framework-agnostic and READ-ONLY: it never signs or
 * routes transactions (all execution goes through KeeperHub). A PositionAdapter
 * knows how to read a protocol's health/risk state; the detector classifies the
 * reading into a ThreatType + severity that drives the defense workflow and the
 * adaptive bounty.
 *
 * The MockVaultAdapter reads our demo vault. An AaveV3Adapter stub shows the
 * exact seam where a real Aave V3 `getUserAccountData` read plugs in — same
 * interface, no changes to the agent loop.
 */

import { ethers } from "ethers";

export type ThreatType =
  | "healthy"
  | "health_factor_drop"
  | "oracle_deviation"
  | "liquidity_drain";

export type Severity = "low" | "medium" | "high" | "critical";

export interface Reading {
  /** Normalized health factor, e.g. 1.05. */
  healthFactor: number;
  /** Raw protocol-specific extras for the audit trail. */
  raw?: Record<string, unknown>;
}

export interface Detection {
  threatType: ThreatType;
  severity: Severity;
  healthFactor: number;
  inDanger: boolean;
  reason: string;
}

export interface PositionAdapter {
  readonly protocol: string;
  read(): Promise<Reading>;
}

/** Classify a reading into a threat + severity given a danger threshold. */
export function classify(reading: Reading, threshold: number): Detection {
  const hf = reading.healthFactor;
  const inDanger = hf < threshold;

  let severity: Severity = "low";
  if (hf < 1.02) severity = "critical";
  else if (hf < 1.06) severity = "high";
  else if (hf < threshold) severity = "medium";

  const threatType: ThreatType = inDanger ? "health_factor_drop" : "healthy";
  const reason = inDanger
    ? `Health factor ${hf.toFixed(2)} < threshold ${threshold.toFixed(2)}`
    : `Health factor ${hf.toFixed(2)} within safe band`;

  return { threatType, severity, healthFactor: hf, inDanger, reason };
}

/**
 * Adapter for our demo MockVault (healthFactor scaled by 100 on-chain).
 */
export class MockVaultAdapter implements PositionAdapter {
  readonly protocol = "MockVault";
  constructor(private contract: ethers.Contract) {}

  async read(): Promise<Reading> {
    const raw = await this.contract.healthFactor();
    let paused = false;
    try {
      paused = await this.contract.paused();
    } catch {
      // older deployments may not expose paused(); ignore
    }
    return {
      healthFactor: Number(raw) / 100,
      raw: { onChainHealthFactor: raw.toString(), paused },
    };
  }
}

/**
 * Aave V3 adapter seam (§4.1). Reads `getUserAccountData(user)` and normalizes
 * the returned healthFactor (1e18-scaled) into a plain number. Wire an aToken /
 * Pool address + user to activate; the agent loop needs no other change.
 */
export class AaveV3Adapter implements PositionAdapter {
  readonly protocol = "AaveV3";
  private pool: ethers.Contract;
  constructor(poolAddress: string, private user: string, provider: ethers.Provider) {
    this.pool = new ethers.Contract(
      poolAddress,
      [
        "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
      ],
      provider
    );
  }

  async read(): Promise<Reading> {
    const data = await this.pool.getUserAccountData(this.user);
    const hfRaw: bigint = data.healthFactor ?? data[5];
    // Aave returns healthFactor scaled by 1e18; cap the "infinite" (no debt) case.
    const hf = hfRaw >= ethers.MaxUint256 / 2n ? 999 : Number(ethers.formatUnits(hfRaw, 18));
    return {
      healthFactor: hf,
      raw: {
        totalCollateralBase: (data.totalCollateralBase ?? data[0]).toString(),
        totalDebtBase: (data.totalDebtBase ?? data[1]).toString(),
        healthFactorRaw: hfRaw.toString(),
      },
    };
  }
}
