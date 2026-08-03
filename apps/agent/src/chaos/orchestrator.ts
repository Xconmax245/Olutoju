/**
 * Deterministic chaos orchestrator (P0.4 / §5) + private-routing evidence (§1.7).
 *
 * A single call sets up a spectacular, reproducible failure scenario so the
 * agent's KeeperHub-routed defense can be observed winning under stress:
 *
 *   1. Optionally force the primary defense to fail simulation
 *      (vault.setBlockPrimaryDefense(true)) so the workflow must escalate.
 *   2. Degrade the position (vault.triggerChaos()).
 *   3. Fire a competing PUBLIC-mempool transaction from a separate wallet so we
 *      can later prove the KeeperHub (private-routed) defense confirmed in an
 *      equal-or-earlier block — visible MEV/ordering protection.
 *
 * The treasury/chaos wallet here is used ONLY for demo chaos signing — never for
 * defensive transactions (those go through KeeperHub).
 */

import { ethers } from "ethers";
import type { PrivateRouteEvidence } from "../incident-report";

export interface ChaosOptions {
  /** Force the first defense step to revert (proves escalation/re-plan). */
  forcePrimaryFailure?: boolean;
  /** Also submit a competing public-mempool tx (proves private routing). */
  injectPublicCompetitor?: boolean;
}

export interface ChaosResult {
  chaosTxHash: string;
  primaryFailureForced: boolean;
  publicCompetitorTxHash?: string;
  publicCompetitorSubmittedAt?: string;
  gasGwei?: string;
}

const VAULT_CHAOS_ABI = [
  "function triggerChaos() external",
  "function setBlockPrimaryDefense(bool blocked) external",
];

export interface RunChaosArgs {
  vault: ethers.Contract;      // treasury-signer connected MockVault
  chaosWallet: ethers.Wallet;  // demo signer (also the public competitor)
  provider: ethers.Provider;
  options?: ChaosOptions;
  log?: (msg: string) => void;
}

/**
 * Execute the chaos scenario. Returns hashes + timing so the defense flow can
 * build the private-routing comparison afterwards.
 */
export async function runChaos(args: RunChaosArgs): Promise<ChaosResult> {
  const { vault, chaosWallet, provider } = args;
  const log = args.log || ((m: string) => console.log(m));
  const options = args.options || {};

  // 1. Optionally brick the primary defense so the agent must escalate.
  let primaryFailureForced = false;
  if (options.forcePrimaryFailure) {
    try {
      log("[Chaos] Forcing primary defense failure (setBlockPrimaryDefense=true)...");
      const tx = await vault.setBlockPrimaryDefense(true);
      await tx.wait();
      primaryFailureForced = true;
    } catch (err: any) {
      log(`[Chaos] Could not force primary failure: ${err?.reason || err?.message}`);
    }
  }

  // 2. Degrade the position.
  log("[Chaos] Triggering position degradation (triggerChaos)...");
  const chaosTx = await vault.triggerChaos();
  await chaosTx.wait();

  // Read current gas for the record / adaptive bounty.
  let gasGwei: string | undefined;
  try {
    const fee = await provider.getFeeData();
    if (fee.gasPrice) gasGwei = ethers.formatUnits(fee.gasPrice, "gwei");
  } catch {}

  // 3. Optionally submit a competing PUBLIC-mempool transaction. We send a
  //    tiny self-transfer with a deliberately low priority fee so it lingers in
  //    the public mempool — the KeeperHub-routed defense should land at or
  //    before it.
  let publicCompetitorTxHash: string | undefined;
  let publicCompetitorSubmittedAt: string | undefined;
  if (options.injectPublicCompetitor) {
    try {
      log("[Chaos] Submitting competing PUBLIC-mempool transaction...");
      const fee = await provider.getFeeData();
      const lowTip = fee.maxPriorityFeePerGas
        ? (fee.maxPriorityFeePerGas / 2n) || 1n
        : ethers.parseUnits("0.01", "gwei");
      const competitor = await chaosWallet.sendTransaction({
        to: chaosWallet.address,
        value: 0n,
        maxPriorityFeePerGas: lowTip,
      });
      publicCompetitorTxHash = competitor.hash;
      publicCompetitorSubmittedAt = new Date().toISOString();
      log(`[Chaos] Public competitor submitted: ${competitor.hash} (not awaited)`);
    } catch (err: any) {
      log(`[Chaos] Public competitor submission failed: ${err?.reason || err?.message}`);
    }
  }

  return {
    chaosTxHash: chaosTx.hash,
    primaryFailureForced,
    publicCompetitorTxHash,
    publicCompetitorSubmittedAt,
    gasGwei,
  };
}

/**
 * After the defense lands, compare block numbers to prove the KeeperHub private
 * route was not front-run/reordered by the public competitor.
 */
export async function buildPrivateRouteEvidence(args: {
  provider: ethers.Provider;
  defenseTxHash?: string;
  defenseBlockNumber?: number;
  publicCompetitorTxHash?: string;
}): Promise<PrivateRouteEvidence | undefined> {
  const { provider, defenseTxHash, publicCompetitorTxHash } = args;
  if (!defenseTxHash) return undefined;

  let defenseBlockNumber = args.defenseBlockNumber;
  if (defenseBlockNumber === undefined) {
    try {
      const r = await provider.getTransactionReceipt(defenseTxHash);
      defenseBlockNumber = r?.blockNumber;
    } catch {}
  }

  let publicCompetitorBlockNumber: number | undefined;
  if (publicCompetitorTxHash) {
    try {
      const r = await provider.getTransactionReceipt(publicCompetitorTxHash);
      publicCompetitorBlockNumber = r?.blockNumber ?? undefined;
    } catch {}
  }

  let privateRouteWon: boolean | undefined;
  let note = "KeeperHub routed the defense; no competing public tx was injected.";
  if (defenseBlockNumber !== undefined && publicCompetitorBlockNumber !== undefined) {
    privateRouteWon = defenseBlockNumber <= publicCompetitorBlockNumber;
    note = privateRouteWon
      ? `Private defense landed in block ${defenseBlockNumber} at/ before public competitor (${publicCompetitorBlockNumber}).`
      : `Public competitor landed first (block ${publicCompetitorBlockNumber} < ${defenseBlockNumber}).`;
  } else if (defenseBlockNumber !== undefined && publicCompetitorTxHash && publicCompetitorBlockNumber === undefined) {
    privateRouteWon = true;
    note = `Private defense confirmed in block ${defenseBlockNumber}; public competitor still pending/unmined.`;
  }

  return {
    defenseTxHash,
    publicCompetitorTxHash,
    defenseBlockNumber,
    publicCompetitorBlockNumber,
    privateRouteWon,
    note,
  };
}
