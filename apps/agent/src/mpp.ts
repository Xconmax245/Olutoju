/**
 * MPP standing retainer (§1.5 / §3.4) — the second half of dual-protocol
 * settlement.
 *
 * Sentinel Mesh earns in TWO complementary ways, and both are surfaced in the
 * same system so the economic model is legible end-to-end:
 *
 *   - x402  → pay-per-successful-defense *incident bounty* (event-driven, gated
 *             on a verified on-chain outcome). See `x402.ts`.
 *   - MPP   → a standing *protection retainer*: the protected protocol pays the
 *             mesh a recurring fee simply for being continuously watched, whether
 *             or not an incident fires this period. This is the "insurance
 *             premium" that funds the watchers' readiness.
 *
 * MPP (Merchant Payment Protocol / recurring machine payments) authorizes a
 * periodic pull from the protocol's treasury to the mesh's retainer address on a
 * fixed cadence. We model the retainer as an accruing schedule and settle a
 * period via an ERC-20 transfer from the protocol's payer signer (the same seam
 * an MPP facilitator would automate). Provenance is always honest: a settlement
 * records whether it was `charged` or merely `accrued` (dry) so the dashboard can
 * distinguish a live pull from a scheduled-but-unconfigured retainer.
 */

import { ethers } from "ethers";

export interface RetainerConfig {
  /** Protocol being protected (label for the audit trail). */
  protocol: string;
  /** ERC-20 the retainer is denominated in (test USDC). */
  asset: string;
  /** Amount charged per period (token base units, as string). */
  amountPerPeriod: string;
  /** Cadence in seconds (e.g. 86400 for daily). */
  periodSeconds: number;
  /** Mesh retainer payout address. */
  payTo: string;
}

export interface RetainerSettlement {
  protocol: string;
  asset: string;
  amount: string;
  payTo: string;
  periodIndex: number;
  periodStart: string;
  periodEnd: string;
  /** True when an on-chain transfer actually settled the period. */
  charged: boolean;
  txHash?: string;
  reason?: string;
  settledAt: string;
}

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

/**
 * A minimal MPP retainer engine. It tracks how many periods have elapsed and
 * settles any that are due. In a full deployment the periodic pull is authorized
 * once via an MPP mandate and executed by the facilitator; here the gating +
 * accrual logic (the important part) is identical.
 */
export class MppRetainer {
  private config: RetainerConfig;
  private startedAt: number;
  private lastSettledPeriod = -1;

  constructor(config: RetainerConfig, startedAtMs: number = Date.now()) {
    this.config = config;
    this.startedAt = startedAtMs;
  }

  /** How many complete periods have elapsed since the mandate started. */
  private elapsedPeriods(nowMs: number): number {
    return Math.floor((nowMs - this.startedAt) / (this.config.periodSeconds * 1000));
  }

  /** Total retainer accrued (base units) whether or not it has been charged. */
  accrued(nowMs: number = Date.now()): string {
    const periods = this.elapsedPeriods(nowMs) + 1; // current period accrues immediately
    return (BigInt(this.config.amountPerPeriod) * BigInt(Math.max(0, periods))).toString();
  }

  /**
   * Settle any due period. If a payer signer is provided, a real ERC-20 transfer
   * is made; otherwise the period is recorded as `accrued` (dry) so the schedule
   * is still visible without requiring funds.
   */
  async settleDuePeriod(args: {
    provider: ethers.Provider;
    payerSigner?: ethers.Wallet;
    nowMs?: number;
    log?: (msg: string) => void;
  }): Promise<RetainerSettlement | null> {
    const now = args.nowMs ?? Date.now();
    const log = args.log || ((m: string) => console.log(m));
    const currentPeriod = this.elapsedPeriods(now);

    if (currentPeriod <= this.lastSettledPeriod) {
      return null; // nothing new is due
    }

    const periodIndex = this.lastSettledPeriod + 1;
    const periodStartMs = this.startedAt + periodIndex * this.config.periodSeconds * 1000;
    const periodEndMs = periodStartMs + this.config.periodSeconds * 1000;
    const settlement: RetainerSettlement = {
      protocol: this.config.protocol,
      asset: this.config.asset,
      amount: this.config.amountPerPeriod,
      payTo: this.config.payTo,
      periodIndex,
      periodStart: new Date(periodStartMs).toISOString(),
      periodEnd: new Date(periodEndMs).toISOString(),
      charged: false,
      settledAt: new Date().toISOString(),
    };

    if (!args.payerSigner) {
      settlement.reason = "no_payer_configured (accrued, not charged)";
      this.lastSettledPeriod = periodIndex;
      log(`[MPP] Retainer period ${periodIndex} accrued (${this.config.amountPerPeriod}) — not charged (no payer).`);
      return settlement;
    }

    try {
      const token = new ethers.Contract(this.config.asset, ERC20_ABI, args.payerSigner);
      log(`[MPP] Charging retainer period ${periodIndex}: ${this.config.amountPerPeriod} → ${this.config.payTo}...`);
      const tx = await token.transfer(this.config.payTo, this.config.amountPerPeriod);
      const receipt = await tx.wait();
      settlement.charged = true;
      settlement.txHash = receipt?.hash || tx.hash;
      this.lastSettledPeriod = periodIndex;
      log(`[MPP] Retainer period ${periodIndex} charged. Tx: ${settlement.txHash}`);
    } catch (err: any) {
      settlement.reason = `charge_failed: ${err?.reason || err?.message}`;
      log(`[MPP] Retainer charge failed: ${settlement.reason}`);
    }
    return settlement;
  }

  describe(): RetainerConfig & { startedAt: string } {
    return { ...this.config, startedAt: new Date(this.startedAt).toISOString() };
  }
}

/** Build a retainer from env, or return null if not configured. */
export function buildRetainerFromEnv(env: NodeJS.ProcessEnv): MppRetainer | null {
  const asset = env.MPP_ASSET;
  const payTo = env.MPP_PAYOUT_ADDRESS;
  const amount = env.MPP_AMOUNT_PER_PERIOD;
  if (!asset || !payTo || !amount) return null;
  return new MppRetainer({
    protocol: env.MPP_PROTOCOL || "MockVault",
    asset,
    amountPerPeriod: amount,
    periodSeconds: Number(env.MPP_PERIOD_SECONDS || 86400),
    payTo,
  });
}
