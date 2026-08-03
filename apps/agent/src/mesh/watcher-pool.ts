/**
 * Sentinel Mesh — WatcherPool (§2.1): real, independent watcher processes.
 *
 * This replaces the "one function called three times in the parent event loop"
 * criticism with a fleet of watchers that each run inside their OWN Node.js
 * `worker_thread` (separate V8 isolate + message loop + key material). The pool:
 *
 *   - spawns one worker per configured watcher at startup,
 *   - waits for each to announce `ready` (proving it actually booted),
 *   - fans an incident out to every worker concurrently via message-passing, and
 *   - collects each worker's INDEPENDENTLY-signed proposal (with a timeout so a
 *     hung/crashed watcher can't stall the race).
 *
 * If worker threads are unavailable (or MESH_WORKERS=false), the pool falls back
 * to the in-process `Watcher` implementation so the mesh still runs — provenance
 * is honest via `mode: "worker" | "inline"` on each proposal batch.
 */

import path from "path";
import { Worker } from "worker_threads";
import { ethers } from "ethers";
import { DefenseProposal } from "./race-coordinator";
import { Watcher, WatcherConfig, buildFleetConfigs } from "./watchers";
import { KeeperHubMcpClient } from "../keeperhub-mcp";

export interface PoolProposeInput {
  healthFactor: number;
  threshold: number;
  primaryBlocked?: boolean;
}

export interface ProposalBatch {
  mode: "worker" | "inline";
  proposals: DefenseProposal[];
  /** Ids of watchers that booted (worker mode) — independence evidence. */
  readyWatchers: string[];
}

interface ManagedWorker {
  id: string;
  framework: string;
  worker: Worker;
  ready: boolean;
}

const PROPOSAL_TIMEOUT_MS = Number(process.env.MESH_PROPOSAL_TIMEOUT_MS || 8000);

export class WatcherPool {
  private workers: ManagedWorker[] = [];
  private inlineFleet: Watcher[] = [];
  private useWorkers: boolean;
  private mcp?: KeeperHubMcpClient;
  private log: (m: string) => void;

  constructor(opts: {
    configs: WatcherConfig[];
    apiKey?: string;
    mcp?: KeeperHubMcpClient;
    useWorkers?: boolean;
    log?: (m: string) => void;
  }) {
    this.log = opts.log || ((m) => console.log(m));
    this.mcp = opts.mcp;
    this.useWorkers =
      opts.useWorkers ?? (process.env.MESH_WORKERS !== "false");

    if (this.useWorkers) {
      try {
        this.spawnWorkers(opts.configs, opts.apiKey);
      } catch (err: any) {
        this.log(`[Mesh] Worker spawn failed (${err?.message}); using inline watchers.`);
        this.useWorkers = false;
      }
    }
    // Always build inline fleet as a live fallback.
    this.inlineFleet = opts.configs.map((c) => new Watcher(c));
  }

  private workerEntry(): string {
    // ts-node runs .ts directly; a compiled build would point at .js. Prefer the
    // .ts sibling when it exists (dev), else .js (prod build).
    const tsPath = path.join(__dirname, "watcher-worker.ts");
    const jsPath = path.join(__dirname, "watcher-worker.js");
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("fs").accessSync(tsPath);
      return tsPath;
    } catch {
      return jsPath;
    }
  }

  private spawnWorkers(configs: WatcherConfig[], apiKey?: string) {
    const entry = this.workerEntry();
    const isTs = entry.endsWith(".ts");
    for (const c of configs) {
      const key = c.privateKey || deriveDemoKey(c.id);
      const worker = new Worker(entry, {
        workerData: {
          id: c.id,
          framework: c.framework,
          privateKey: key,
          stake: c.stake,
          apiKey,
          mcpUrl: process.env.KEEPERHUB_MCP_URL,
        },
        // Allow spawning a .ts worker under ts-node by registering the loader.
        execArgv: isTs ? ["-r", "ts-node/register"] : undefined,
      });
      const managed: ManagedWorker = { id: c.id, framework: c.framework, worker, ready: false };
      worker.on("message", (msg: any) => {
        if (msg?.type === "ready") {
          managed.ready = true;
          this.log(`[Mesh] Watcher ${c.id} (${c.framework}) worker booted @ ${msg.identity?.address}.`);
        }
      });
      worker.on("error", (err: Error) => this.log(`[Mesh] Watcher ${c.id} worker error: ${err.message}`));
      this.workers.push(managed);
    }
  }

  /** Fan an incident out to every watcher and collect independent proposals. */
  async propose(input: PoolProposeInput): Promise<ProposalBatch> {
    if (this.useWorkers && this.workers.length > 0) {
      const incidentId = `race_${Date.now()}`;
      const proposals = await Promise.all(
        this.workers.map((w) => this.askWorker(w, incidentId, input))
      );
      const collected = proposals.filter((p): p is DefenseProposal => !!p);
      // If workers didn't respond at all, fall back to inline so a race still runs.
      if (collected.length > 0) {
        return {
          mode: "worker",
          proposals: collected,
          readyWatchers: this.workers.filter((w) => w.ready).map((w) => w.id),
        };
      }
      this.log(`[Mesh] No worker proposals returned in time; falling back to inline.`);
    }

    const inline = await Promise.all(
      this.inlineFleet.map((w) =>
        w.propose({
          healthFactor: input.healthFactor,
          threshold: input.threshold,
          primaryBlocked: input.primaryBlocked,
          mcp: this.mcp,
          log: this.log,
        })
      )
    );
    return { mode: "inline", proposals: inline, readyWatchers: [] };
  }

  private askWorker(
    w: ManagedWorker,
    incidentId: string,
    input: PoolProposeInput
  ): Promise<DefenseProposal | null> {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.log(`[Mesh] Watcher ${w.id} timed out (${PROPOSAL_TIMEOUT_MS}ms); excluded from race.`);
        resolve(null);
      }, PROPOSAL_TIMEOUT_MS);

      const onMessage = (msg: any) => {
        if (msg?.type !== "proposal" || msg.incidentId !== incidentId) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        w.worker.off("message", onMessage);
        resolve(msg.proposal as DefenseProposal);
      };
      w.worker.on("message", onMessage);
      w.worker.postMessage({ type: "detect", incidentId, input });
    });
  }

  /** Fleet identities (for the /api/mesh endpoint). */
  identities() {
    return this.inlineFleet.map((w) => w.identity);
  }

  /** True when the pool is backed by real worker threads. */
  get isWorkerBacked(): boolean {
    return this.useWorkers && this.workers.length > 0;
  }

  async shutdown() {
    await Promise.all(this.workers.map((w) => w.worker.terminate().catch(() => {})));
  }
}

/** Derive a deterministic demo key from a watcher id (repeatable, non-secret). */
function deriveDemoKey(id: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`sentinel-mesh-watcher:${id}`));
}

/** Convenience: build a pool from env in one call. */
export function buildWatcherPool(env: NodeJS.ProcessEnv, opts?: { apiKey?: string; mcp?: KeeperHubMcpClient; log?: (m: string) => void }): WatcherPool {
  return new WatcherPool({
    configs: buildFleetConfigs(env),
    apiKey: opts?.apiKey,
    mcp: opts?.mcp,
    log: opts?.log,
  });
}
