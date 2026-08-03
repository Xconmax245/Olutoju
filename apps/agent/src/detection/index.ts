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

/**
 * Morpho Blue adapter (§4.2). Morpho Blue has no native health-factor getter, so
 * we derive one the way the protocol defines solvency:
 *
 *     healthFactor = (collateral * price * LLTV) / borrowed
 *
 * using the on-chain `position(id,user)` + `market(id)` reads plus the market's
 * oracle `price()`. A value ≥ 1 means the position is above its liquidation
 * threshold. This is a REAL read against Morpho Blue's singleton — wire the
 * market id + user to activate; the agent loop needs no other change.
 */
export class MorphoBlueAdapter implements PositionAdapter {
  readonly protocol = "MorphoBlue";
  private morpho: ethers.Contract;
  private oracle?: ethers.Contract;

  constructor(
    morphoAddress: string,
    private marketId: string,
    private user: string,
    provider: ethers.Provider,
    oracleAddress?: string
  ) {
    this.morpho = new ethers.Contract(
      morphoAddress,
      [
        "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
        "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
        "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
      ],
      provider
    );
    if (oracleAddress) {
      this.oracle = new ethers.Contract(
        oracleAddress,
        ["function price() view returns (uint256)"],
        provider
      );
    }
  }

  async read(): Promise<Reading> {
    const id = this.marketId;
    const [pos, mkt, params] = await Promise.all([
      this.morpho.position(id, this.user),
      this.morpho.market(id),
      this.morpho.idToMarketParams(id),
    ]);

    const collateral: bigint = pos.collateral ?? pos[2];
    const borrowShares: bigint = pos.borrowShares ?? pos[1];
    const totalBorrowAssets: bigint = mkt.totalBorrowAssets ?? mkt[2];
    const totalBorrowShares: bigint = mkt.totalBorrowShares ?? mkt[3];
    const lltv: bigint = params.lltv ?? params[4]; // 1e18-scaled

    // Convert this user's borrow shares into borrowed assets.
    const borrowed =
      totalBorrowShares > 0n ? (borrowShares * totalBorrowAssets) / totalBorrowShares : 0n;

    // No debt → maximally healthy.
    if (borrowed === 0n) {
      return { healthFactor: 999, raw: { collateral: collateral.toString(), borrowed: "0" } };
    }

    // Morpho oracle price is scaled 1e36 / collateral-decimals; use it if wired,
    // else assume a 1:1 price (still a real solvency ratio for same-decimals mkts).
    let price = 10n ** 36n;
    let oracleUsed = false;
    if (this.oracle) {
      try {
        price = await this.oracle.price();
        oracleUsed = true;
      } catch {
        /* fall back to 1:1 */
      }
    }

    // maxBorrow = collateral * price / 1e36 * lltv / 1e18
    const collateralValue = (collateral * price) / 10n ** 36n;
    const maxBorrow = (collateralValue * lltv) / 10n ** 18n;
    const hf = borrowed > 0n ? Number(maxBorrow) / Number(borrowed) : 999;

    return {
      healthFactor: hf,
      raw: {
        collateral: collateral.toString(),
        borrowed: borrowed.toString(),
        lltv: lltv.toString(),
        oracleUsed,
      },
    };
  }
}

/**
 * Build the right PositionAdapter for a monitored position from env-style config.
 * Keeps the agent loop protocol-agnostic: it just calls `adapter.read()`.
 *
 *   protocol="mock"   → MockVaultAdapter (demo)
 *   protocol="aave"   → AaveV3Adapter    (needs AAVE_POOL + user address)
 *   protocol="morpho" → MorphoBlueAdapter(needs MORPHO + marketId + user [+oracle])
 */
export function buildAdapter(opts: {
  protocol?: string;
  provider: ethers.Provider;
  contract?: ethers.Contract; // for mock
  // aave
  aavePool?: string;
  // morpho
  morpho?: string;
  marketId?: string;
  oracle?: string;
  // shared
  user?: string;
}): PositionAdapter {
  const protocol = (opts.protocol || "mock").toLowerCase();
  if (protocol === "aave") {
    if (!opts.aavePool || !opts.user) {
      throw new Error("AaveV3Adapter requires aavePool + user.");
    }
    return new AaveV3Adapter(opts.aavePool, opts.user, opts.provider);
  }
  if (protocol === "morpho") {
    if (!opts.morpho || !opts.marketId || !opts.user) {
      throw new Error("MorphoBlueAdapter requires morpho + marketId + user.");
    }
    return new MorphoBlueAdapter(opts.morpho, opts.marketId, opts.user, opts.provider, opts.oracle);
  }
  if (!opts.contract) {
    throw new Error("MockVaultAdapter requires a contract instance.");
  }
  return new MockVaultAdapter(opts.contract);
}
