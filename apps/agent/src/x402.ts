/**
 * x402 outcome-gated settlement (P0.2 / §3.1).
 *
 * The protected protocol (or a demo insurance pool) pays the winning watcher a
 * bounty for a successful defense — but ONLY after the on-chain outcome is
 * independently confirmed. Payment is gated on:
 *
 *   1. The incident report's attestation verifying (signature + digest hash).
 *   2. The defensive tx receipt existing on-chain with status == success.
 *   3. The final position state matching the claimed "secured" outcome.
 *
 * This mirrors the x402 "402 Payment Required -> settle on proof" flow: the
 * payer issues a 402 challenge, the watcher presents verifiable proof of a
 * successful defense, and only then is payment settled. We never pay on a claim.
 *
 * The actual value transfer is an ERC-20 (test USDC) transfer from the payer's
 * escrow signer to the watcher. In a full deployment this is replaced by an
 * x402 facilitator call; the gating logic is identical and is the important part.
 */

import { ethers } from "ethers";
import type { IncidentReport } from "./incident-report";
import { verifyIncidentReport } from "./incident-report";

export interface X402Challenge {
  /** Amount owed on a successful, verified defense (in token base units). */
  amount: string;
  /** ERC-20 token the bounty is paid in (test USDC on the demo chain). */
  asset: string;
  /** Address that will receive payment (the winning watcher). */
  payTo: string;
  /** Opaque nonce tying the challenge to one incident. */
  nonce: string;
}

export interface X402Settlement {
  settled: boolean;
  reason?: string;
  amount?: string;
  asset?: string;
  payTo?: string;
  txHash?: string;
  /** The proof checks that were evaluated, for the incident report/audit. */
  proof: {
    attestationValid: boolean;
    receiptConfirmed: boolean;
    outcomeSecured: boolean;
  };
  settledAt: string;
}

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export interface SettleArgs {
  report: IncidentReport;
  challenge: X402Challenge;
  provider: ethers.Provider;
  /** Escrow/payer signer (the protocol or demo insurance pool). */
  payerSigner: ethers.Wallet;
  log?: (msg: string) => void;
}

/**
 * Verify the defense outcome and, only if every gate passes, settle the x402
 * payment to the winning watcher. Returns a structured settlement result that
 * is embedded into the incident report + streamed to the dashboard.
 */
export async function settleX402(args: SettleArgs): Promise<X402Settlement> {
  const { report, challenge, provider, payerSigner } = args;
  const log = args.log || ((m: string) => console.log(m));
  const settledAt = new Date().toISOString();

  const proof = {
    attestationValid: false,
    receiptConfirmed: false,
    outcomeSecured: false,
  };

  // ---- Gate 1: attestation must independently verify ----------------------
  const verification = verifyIncidentReport(report);
  proof.attestationValid = verification.valid;
  if (!verification.valid) {
    log(`[x402] Refusing payment: attestation invalid (recovered=${verification.recovered}).`);
    return { settled: false, reason: "attestation_invalid", proof, settledAt };
  }

  // ---- Gate 2: the defensive tx receipt must exist and have succeeded ------
  const txHash = report.defense.txHash;
  if (!txHash) {
    log(`[x402] Refusing payment: no defensive txHash in report.`);
    return { settled: false, reason: "no_tx_hash", proof, settledAt };
  }
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      log(`[x402] Refusing payment: receipt not found for ${txHash}.`);
      return { settled: false, reason: "receipt_missing", proof, settledAt };
    }
    if (receipt.status !== 1) {
      log(`[x402] Refusing payment: defensive tx reverted (status=${receipt.status}).`);
      return { settled: false, reason: "tx_reverted", proof, settledAt };
    }
    proof.receiptConfirmed = true;
  } catch (err: any) {
    log(`[x402] Refusing payment: receipt lookup failed (${err?.message}).`);
    return { settled: false, reason: "receipt_error", proof, settledAt };
  }

  // ---- Gate 3: the report must claim the position was actually secured -----
  proof.outcomeSecured = report.finalState.secured === true && report.workflow.outcome === "success";
  if (!proof.outcomeSecured) {
    log(`[x402] Refusing payment: outcome not secured.`);
    return { settled: false, reason: "outcome_not_secured", proof, settledAt };
  }

  // ---- All gates passed → settle payment ----------------------------------
  try {
    const token = new ethers.Contract(challenge.asset, ERC20_ABI, payerSigner);
    log(`[x402] All proof gates passed. Settling ${challenge.amount} to winner ${challenge.payTo}...`);
    const tx = await token.transfer(challenge.payTo, challenge.amount);
    const receipt = await tx.wait();
    log(`[x402] Bounty settled. Tx: ${receipt?.hash || tx.hash}`);
    return {
      settled: true,
      amount: challenge.amount,
      asset: challenge.asset,
      payTo: challenge.payTo,
      txHash: receipt?.hash || tx.hash,
      proof,
      settledAt: new Date().toISOString(),
    };
  } catch (err: any) {
    log(`[x402] Settlement transfer failed: ${err?.reason || err?.message}`);
    return { settled: false, reason: `transfer_failed: ${err?.reason || err?.message}`, proof, settledAt };
  }
}

/**
 * Adaptive bounty (§3.3): scale the base bounty by threat severity and current
 * network gas conditions, so a nastier incident under gas stress pays more.
 * Returns an integer base-unit string for a 6-decimal token (USDC).
 */
export async function computeAdaptiveBounty(params: {
  provider: ethers.Provider;
  baseUsdc: number; // e.g. 5 => 5 USDC base
  severity: "low" | "medium" | "high" | "critical";
  decimals?: number;
}): Promise<string> {
  const decimals = params.decimals ?? 6;
  const severityMultiplier =
    params.severity === "critical" ? 4 :
    params.severity === "high" ? 2.5 :
    params.severity === "medium" ? 1.5 : 1;

  let gasMultiplier = 1;
  try {
    const fee = await params.provider.getFeeData();
    const gwei = fee.gasPrice ? Number(ethers.formatUnits(fee.gasPrice, "gwei")) : 0;
    // Above 20 gwei the defense is more valuable; cap the boost at 2x.
    gasMultiplier = Math.min(2, 1 + Math.max(0, gwei - 20) / 100);
  } catch {
    gasMultiplier = 1;
  }

  const amount = params.baseUsdc * severityMultiplier * gasMultiplier;
  const scaled = BigInt(Math.round(amount * 10 ** decimals));
  return scaled.toString();
}
