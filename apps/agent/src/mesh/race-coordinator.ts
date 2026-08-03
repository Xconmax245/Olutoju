/**
 * Sentinel Mesh — multi-watcher race / consensus layer (§2 + §3.2).
 *
 * This is the piece that turns a single guardian into an *economic network*.
 * Several independent watcher agents (ideally different frameworks) detect the
 * same anomaly and each INDEPENDENTLY proposes a defensive action. Every
 * proposal is validated by a **simulation-first** gate through KeeperHub. The
 * coordinator then selects the winner under an explicit, auditable policy:
 *
 *   "first valid, simulation-passing proposal wins"
 *
 * Only the winner is allowed to execute + claim the bounty. Losers who staked
 * on an INVALID proposal (simulation failed) are slashed; losers who simply
 * arrived second keep their stake. The whole race is recorded so the incident
 * report can prove exactly one watcher executed and why.
 *
 * Crucially, the coordinator does NOT sign or route anything itself. It only
 * ranks proposals; execution still flows through KeeperHub Direct Execution via
 * the caller. This keeps the security invariant intact (watchers never hold
 * funds, never self-broadcast defenses).
 */

import type { KeeperHubClient } from "../keeperhub";

export interface WatcherIdentity {
  id: string;
  /** Framework the watcher is built on — mesh diversity signal. */
  framework: "raw-node" | "mcp" | "langchain" | string;
  /** Address used to sign the watcher's proposal (never to sign the defense tx). */
  address: string;
}

export interface DefenseProposal {
  watcher: WatcherIdentity;
  /** The contract function this watcher wants to call. */
  functionName: string;
  functionArgs?: unknown[];
  /** Stake the watcher posts behind this proposal (token base units, as string). */
  stake: string;
  /** Watcher's self-reported detection latency (ms) — tiebreaker + telemetry. */
  detectionLatencyMs: number;
  /** Monotonic submission order assigned by the coordinator. */
  submittedAt: string;
}

export interface EvaluatedProposal extends DefenseProposal {
  simulated: boolean;
  simulationPassed: boolean;
  simulationReason?: string;
  /** Rank after policy is applied (1 = winner). Undefined if disqualified. */
  rank?: number;
  /** True when this proposal's stake is slashed (invalid simulation). */
  slashed: boolean;
  disqualifiedReason?: string;
}

export interface RaceResult {
  raceId: string;
  contractAddress: string;
  chainId: number;
  proposals: EvaluatedProposal[];
  winner?: EvaluatedProposal;
  /** Total stake slashed from watchers whose simulation failed. */
  slashedStakeTotal: string;
  policy: string;
  startedAt: string;
  finishedAt: string;
}

export interface RunRaceArgs {
  keeperhub: KeeperHubClient;
  contractAddress: string;
  chainId: number;
  abi: unknown[];
  proposals: DefenseProposal[];
  log?: (msg: string) => void;
}

const POLICY = "first-valid-simulation-wins";

/**
 * Evaluate every proposal (simulate-first through KeeperHub), then apply the
 * consensus policy. Proposals are simulated concurrently — the mesh is a genuine
 * race — but ranking is deterministic: valid proposals are ordered by
 * (detectionLatencyMs asc, submittedAt asc), so the fastest correct watcher wins.
 */
export async function runRace(args: RunRaceArgs): Promise<RaceResult> {
  const { keeperhub, contractAddress, chainId, abi } = args;
  const log = args.log || ((m: string) => console.log(m));
  const raceId = `race_${Date.now()}`;
  const startedAt = new Date().toISOString();

  log(`[Mesh ${raceId}] ${args.proposals.length} watchers detected the anomaly. Racing (policy=${POLICY})...`);

  // ---- Simulate every proposal concurrently (independent validation) -------
  const evaluated: EvaluatedProposal[] = await Promise.all(
    args.proposals.map(async (p): Promise<EvaluatedProposal> => {
      const base: EvaluatedProposal = {
        ...p,
        simulated: false,
        simulationPassed: false,
        slashed: false,
      };
      try {
        log(`[Mesh ${raceId}] Validating ${p.watcher.id} (${p.watcher.framework}) → ${p.functionName}...`);
        const sim = await keeperhub.simulateContractCall({
          contractAddress,
          chainId,
          functionName: p.functionName,
          functionArgs: p.functionArgs ?? [],
          abi,
        });
        base.simulated = true;
        base.simulationPassed = sim.ok;
        base.simulationReason = sim.reason;
        if (!sim.ok) {
          // A watcher that proposed an invalid (reverting) defense is slashed.
          base.slashed = true;
          base.disqualifiedReason = `simulation_failed: ${sim.reason || "would revert"}`;
          log(`[Mesh ${raceId}] ${p.watcher.id} proposal INVALID (${base.disqualifiedReason}). Stake slashed.`);
        }
      } catch (err: any) {
        base.simulated = true;
        base.simulationPassed = false;
        base.slashed = true;
        base.disqualifiedReason = `simulation_error: ${err?.message || "unknown"}`;
        log(`[Mesh ${raceId}] ${p.watcher.id} simulation errored; stake slashed.`);
      }
      return base;
    })
  );

  // ---- Apply consensus policy: rank valid proposals deterministically ------
  const valid = evaluated
    .filter((e) => e.simulationPassed)
    .sort((a, b) =>
      a.detectionLatencyMs !== b.detectionLatencyMs
        ? a.detectionLatencyMs - b.detectionLatencyMs
        : a.submittedAt.localeCompare(b.submittedAt)
    );

  valid.forEach((e, i) => {
    e.rank = i + 1;
  });

  const winner = valid[0];
  if (winner) {
    log(`[Mesh ${raceId}] Winner: ${winner.watcher.id} (${winner.watcher.framework}) with ${winner.functionName}. Only the winner may execute.`);
  } else {
    log(`[Mesh ${raceId}] No valid proposal — every watcher's simulation failed. Escalation required.`);
  }

  const slashedStakeTotal = evaluated
    .filter((e) => e.slashed)
    .reduce((sum, e) => sum + BigInt(e.stake || "0"), 0n)
    .toString();

  return {
    raceId,
    contractAddress,
    chainId,
    proposals: evaluated,
    winner,
    slashedStakeTotal,
    policy: POLICY,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
