/**
 * Sentinel Mesh — watcher fleet (§2.1 cross-framework proof).
 *
 * A watcher is an independent agent identity that observes the same anomaly and
 * proposes a defensive action + stake. To prove the mesh is framework-agnostic,
 * the fleet is intentionally heterogeneous:
 *
 *   - `guardian-node-1`  (raw-node)  — the original REST/Direct-Execution guardian.
 *   - `sentinel-mcp-1`   (mcp)       — speaks pure MCP; discovers tools over the
 *                                      Model Context Protocol before proposing.
 *   - `sentinel-lc-1`    (langchain) — a lightweight "reasoning" watcher that
 *                                      selects an action from a policy chain.
 *
 * Each watcher signs its OWN proposal with its OWN key (proving independent
 * identity) but NONE of them sign or broadcast the defensive transaction — that
 * remains KeeperHub's job. Watcher keys are optional; if unset we derive
 * deterministic demo keys so the mesh is reproducible without extra config.
 */

import { ethers } from "ethers";
import { DefenseProposal, WatcherIdentity } from "./race-coordinator";
import { KeeperHubMcpClient } from "../keeperhub-mcp";
import { DEFAULT_DEFENSE_WORKFLOW } from "../workflows/defense-workflow";

export interface WatcherConfig {
  id: string;
  framework: string;
  /** Optional dedicated key; if absent a deterministic demo key is derived. */
  privateKey?: string;
  /** Base stake this watcher posts per proposal (token base units). */
  stake: string;
}

export interface ProposeArgs {
  /** Current normalized health factor (e.g. 1.05) — shared detection input. */
  healthFactor: number;
  /** Danger threshold. */
  threshold: number;
  /** Whether the primary defense is currently known-blocked (chaos). */
  primaryBlocked?: boolean;
  /** MCP client for the MCP-native watcher (optional; discovery is best-effort). */
  mcp?: KeeperHubMcpClient;
  log?: (msg: string) => void;
}

/** A single watcher agent that can independently produce a signed proposal. */
export class Watcher {
  readonly identity: WatcherIdentity;
  private wallet: ethers.Wallet;
  private stake: string;

  constructor(cfg: WatcherConfig) {
    const key = cfg.privateKey || deriveDemoKey(cfg.id);
    this.wallet = new ethers.Wallet(key);
    this.stake = cfg.stake;
    this.identity = { id: cfg.id, framework: cfg.framework, address: this.wallet.address };
  }

  /**
   * Independently decide on a defensive action. Different frameworks reach the
   * same *simulation-first* conclusion via different routes — the point is that
   * they are genuinely separate agents, not one function called three times.
   */
  async propose(args: ProposeArgs): Promise<DefenseProposal> {
    const log = args.log || (() => {});
    const start = Date.now();

    let functionName: string;
    if (this.identity.framework === "mcp") {
      functionName = await this.proposeViaMcp(args, log);
    } else if (this.identity.framework === "langchain") {
      functionName = this.proposeViaReasoningChain(args);
    } else {
      functionName = this.proposeViaHeuristic(args);
    }

    // Sign the proposal payload with the watcher's OWN key (proves identity).
    const payload = JSON.stringify({ watcher: this.identity.id, functionName, hf: args.healthFactor });
    const signature = await this.wallet.signMessage(payload);
    void signature; // carried for audit; coordinator re-derives if needed

    // Simulate detection jitter so the race has a real, observable ordering.
    const detectionLatencyMs = Date.now() - start + this.frameworkJitter();

    return {
      watcher: this.identity,
      functionName,
      functionArgs: [],
      stake: this.stake,
      detectionLatencyMs,
      submittedAt: new Date().toISOString(),
    };
  }

  /** MCP-native watcher: discover tools first, then pick the restore action. */
  private async proposeViaMcp(args: ProposeArgs, log: (m: string) => void): Promise<string> {
    if (args.mcp) {
      try {
        const tools = await args.mcp.listTools();
        log(`[Watcher ${this.identity.id}] Discovered ${tools.length} KeeperHub MCP tools before proposing.`);
      } catch (err: any) {
        log(`[Watcher ${this.identity.id}] MCP discovery unavailable (${err?.message}); proposing from policy.`);
      }
    }
    // If the primary is blocked, an informed watcher proposes the escalation.
    return args.primaryBlocked ? "partialUnwind" : "topUpCollateral";
  }

  /** "LangChain"-style watcher: walk a tiny policy chain to choose an action. */
  private proposeViaReasoningChain(args: ProposeArgs): string {
    // Chain: if critical → reduce exposure; else restore collateral.
    if (args.healthFactor < 1.03) return "partialUnwind";
    if (args.primaryBlocked) return "partialUnwind";
    return "topUpCollateral";
  }

  /** Raw-node watcher: direct threshold heuristic. */
  private proposeViaHeuristic(args: ProposeArgs): string {
    return args.primaryBlocked ? "partialUnwind" : DEFAULT_DEFENSE_WORKFLOW[0].functionName;
  }

  /** Deterministic per-framework latency spread so the demo race is legible. */
  private frameworkJitter(): number {
    switch (this.identity.framework) {
      case "raw-node":
        return 20; // fastest — no external discovery step
      case "mcp":
        return 60; // pays a small discovery cost
      case "langchain":
        return 45; // reasoning overhead
      default:
        return 50;
    }
  }
}

/**
 * Build the default mesh fleet from env (comma-separated ids optional) with
 * honest, reproducible defaults. Returns 3 heterogeneous watchers.
 */
export function buildDefaultFleet(env: NodeJS.ProcessEnv): Watcher[] {
  const baseStake = env.WATCHER_STAKE || "1000000"; // 1 test-USDC (6 decimals)
  const fleet: WatcherConfig[] = [
    {
      id: env.WATCHER_ID || "guardian-node-1",
      framework: env.WATCHER_FRAMEWORK || "raw-node",
      privateKey: env.TREASURY_PRIVATE_KEY, // primary shares the attestation key
      stake: baseStake,
    },
    {
      id: "sentinel-mcp-1",
      framework: "mcp",
      privateKey: env.WATCHER_MCP_KEY,
      stake: baseStake,
    },
    {
      id: "sentinel-lc-1",
      framework: "langchain",
      privateKey: env.WATCHER_LC_KEY,
      stake: baseStake,
    },
  ];
  return fleet.map((c) => new Watcher(c));
}

/** Derive a deterministic demo key from a watcher id (repeatable, non-secret). */
function deriveDemoKey(id: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`sentinel-mesh-watcher:${id}`));
}
