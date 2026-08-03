/**
 * Audit Trail as Product (P0.3) + Verifiable Defense Attestation (P1/§3.5).
 *
 * Turns a raw defense run into a structured, public, exportable incident report
 * built directly from KeeperHub-style audit fields (trigger, per-step simulation
 * result, submitted tx, gas used, outcome, timestamps) and anchors it with a
 * deterministic content hash + ECDSA signature so any third party can verify it
 * without trusting our server.
 *
 * Verification (independent): recompute keccak256 over the canonical `digest`
 * payload, then `ethers.verifyMessage(digest, signature)` must equal
 * `verifier_pubkey`.
 */

import { ethers } from "ethers";
import type { WorkflowRunResult, WorkflowStepResult } from "./workflows/defense-workflow";

export interface IncidentTrigger {
  positionId: string;
  positionLabel: string;
  protocol: string;
  threatType: string;
  healthFactor: string;
  threshold: string;
  detectedAt: string;
}

export interface PrivateRouteEvidence {
  /** Hash of the defense tx routed through KeeperHub's private path. */
  defenseTxHash?: string;
  /** Hash of the artificially-injected competing public-mempool tx (chaos). */
  publicCompetitorTxHash?: string;
  /** Block in which the private defense landed. */
  defenseBlockNumber?: number;
  /** Block in which the public competitor landed (>= defense block proves ordering win). */
  publicCompetitorBlockNumber?: number;
  /** True when the KeeperHub-routed defense confirmed in a block <= the competitor. */
  privateRouteWon?: boolean;
  note?: string;
}

export interface IncidentReport {
  schema: "sentinel-mesh.incident.v1";
  incidentId: string;
  chainId: number;
  contractAddress: string;
  trigger: IncidentTrigger;

  /** Full workflow decision path (every simulated/executed step). */
  workflow: {
    workflowId: string;
    outcome: WorkflowRunResult["outcome"];
    steps: WorkflowStepResult[];
    winningStepId?: string;
  };

  /** Winning defensive transaction, promoted for convenience. */
  defense: {
    action?: string;
    txHash?: string;
    transactionLink?: string;
    blockNumber?: number;
    gasUsed?: string;
  };

  finalState: {
    healthFactor: string;
    secured: boolean;
  };

  privateRouting?: PrivateRouteEvidence;

  /** Which agent/watcher produced this defense (mesh identity). */
  watcher: {
    id: string;
    framework: string;
    address: string;
  };

  timestamps: {
    detectedAt: string;
    startedAt: string;
    finishedAt: string;
  };

  /** Deterministic content digest (stable JSON, no signature fields). */
  digest: string;
  digestHash: string; // keccak256 of digest
  verifier_pubkey: string;
  signature: string;
}

export interface BuildIncidentReportArgs {
  incidentId: string;
  chainId: number;
  contractAddress: string;
  trigger: IncidentTrigger;
  run: WorkflowRunResult;
  finalHealthFactor: string;
  watcher: { id: string; framework: string; address: string };
  privateRouting?: PrivateRouteEvidence;
  /** Wallet used ONLY to sign attestations (never to sign defensive txs). */
  signer: ethers.Wallet;
}

/**
 * Produces the canonical, signable digest. Field order is fixed so the hash is
 * reproducible by any independent verifier.
 */
export function canonicalDigest(input: {
  incidentId: string;
  chainId: number;
  contractAddress: string;
  trigger: IncidentTrigger;
  workflowId: string;
  outcome: string;
  winningStepId?: string;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  finalHealthFactor: string;
  watcherId: string;
}): string {
  // JSON.stringify with an explicit key array = deterministic ordering.
  return JSON.stringify({
    schema: "sentinel-mesh.incident.v1",
    incidentId: input.incidentId,
    chainId: input.chainId,
    contractAddress: input.contractAddress.toLowerCase(),
    trigger: {
      positionId: input.trigger.positionId,
      protocol: input.trigger.protocol,
      threatType: input.trigger.threatType,
      healthFactor: input.trigger.healthFactor,
      threshold: input.trigger.threshold,
      detectedAt: input.trigger.detectedAt,
    },
    workflowId: input.workflowId,
    outcome: input.outcome,
    winningStepId: input.winningStepId ?? null,
    txHash: input.txHash ?? null,
    blockNumber: input.blockNumber ?? null,
    gasUsed: input.gasUsed ?? null,
    finalHealthFactor: input.finalHealthFactor,
    watcherId: input.watcherId,
  });
}

export async function buildIncidentReport(args: BuildIncidentReportArgs): Promise<IncidentReport> {
  const { run, trigger, signer } = args;
  const winning = run.winningStep;

  const digest = canonicalDigest({
    incidentId: args.incidentId,
    chainId: args.chainId,
    contractAddress: args.contractAddress,
    trigger,
    workflowId: run.workflowId,
    outcome: run.outcome,
    winningStepId: winning?.id,
    txHash: winning?.txHash,
    blockNumber: winning?.blockNumber,
    gasUsed: winning?.gasUsed,
    finalHealthFactor: args.finalHealthFactor,
    watcherId: args.watcher.id,
  });

  const digestHash = ethers.keccak256(ethers.toUtf8Bytes(digest));
  const signature = await signer.signMessage(digest);

  return {
    schema: "sentinel-mesh.incident.v1",
    incidentId: args.incidentId,
    chainId: args.chainId,
    contractAddress: args.contractAddress,
    trigger,
    workflow: {
      workflowId: run.workflowId,
      outcome: run.outcome,
      steps: run.steps,
      winningStepId: winning?.id,
    },
    defense: {
      action: winning?.label,
      txHash: winning?.txHash,
      transactionLink: winning?.transactionLink,
      blockNumber: winning?.blockNumber,
      gasUsed: winning?.gasUsed,
    },
    finalState: {
      healthFactor: args.finalHealthFactor,
      secured: run.outcome === "success",
    },
    privateRouting: args.privateRouting,
    watcher: args.watcher,
    timestamps: {
      detectedAt: trigger.detectedAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    },
    digest,
    digestHash,
    verifier_pubkey: signer.address,
    signature,
  };
}

/**
 * Independently verify an incident report's attestation. Returns the recovered
 * signer address and whether it matches the claimed verifier — usable by other
 * agents/protocols/CI without any trust in our server.
 */
export function verifyIncidentReport(report: IncidentReport): {
  valid: boolean;
  recovered: string;
  digestHashMatches: boolean;
} {
  let recovered = "";
  try {
    recovered = ethers.verifyMessage(report.digest, report.signature);
  } catch {
    recovered = "";
  }
  const digestHashMatches =
    ethers.keccak256(ethers.toUtf8Bytes(report.digest)) === report.digestHash;
  const valid =
    digestHashMatches &&
    recovered.toLowerCase() === report.verifier_pubkey.toLowerCase();
  return { valid, recovered, digestHashMatches };
}
