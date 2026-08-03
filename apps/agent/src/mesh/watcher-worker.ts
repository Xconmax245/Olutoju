/**
 * Sentinel Mesh — independent watcher WORKER (§2.1).
 *
 * This module is the entrypoint executed inside a dedicated Node.js
 * `worker_thread`. Each watcher therefore runs in its OWN thread with its OWN
 * V8 isolate, its OWN key material, and its OWN message loop — it is genuinely a
 * separate process-like actor, not "one function called three times" in the
 * parent event loop. The parent (WatcherPool) talks to it purely over the
 * structured-clone message channel:
 *
 *   parent → worker : { type: "detect", incidentId, input }
 *   worker → parent : { type: "proposal", incidentId, proposal }   (signed)
 *   worker → parent : { type: "ready", identity }                  (on boot)
 *
 * The worker independently decides on a defensive action using its framework's
 * strategy, signs the proposal with its own private key (proving independent
 * identity), and returns it. It NEVER signs or broadcasts the on-chain defense
 * — that still flows through KeeperHub in the parent. This preserves the core
 * security invariant while making the mesh's independence real.
 */

import { parentPort, workerData } from "worker_threads";
import { ethers } from "ethers";
import { KeeperHubMcpClient } from "../keeperhub-mcp";

interface WorkerConfig {
  id: string;
  framework: string;
  privateKey: string;
  stake: string;
  apiKey?: string;
  mcpUrl?: string;
}

interface DetectInput {
  healthFactor: number;
  threshold: number;
  primaryBlocked?: boolean;
}

const cfg = workerData as WorkerConfig;
const wallet = new ethers.Wallet(cfg.privateKey);
const identity = { id: cfg.id, framework: cfg.framework, address: wallet.address };

// An MCP-native watcher keeps its own MCP client (independent discovery).
const mcp =
  cfg.framework === "mcp" && cfg.apiKey
    ? new KeeperHubMcpClient(cfg.apiKey, cfg.mcpUrl)
    : undefined;

/** Framework-specific, independent action selection. */
async function decideAction(input: DetectInput, notes: string[]): Promise<string> {
  switch (cfg.framework) {
    case "mcp": {
      // MCP-native watcher discovers tools first (real, independent round-trip).
      if (mcp) {
        try {
          const tools = await mcp.listTools();
          notes.push(`discovered ${tools.length} MCP tools before proposing`);
        } catch (err: any) {
          notes.push(`MCP discovery unavailable: ${err?.message}`);
        }
      }
      return input.primaryBlocked ? "partialUnwind" : "topUpCollateral";
    }
    case "langchain": {
      // Tiny reasoning chain.
      if (input.healthFactor < 1.03) return "partialUnwind";
      if (input.primaryBlocked) return "partialUnwind";
      return "topUpCollateral";
    }
    default: {
      // raw-node heuristic.
      return input.primaryBlocked ? "partialUnwind" : "topUpCollateral";
    }
  }
}

parentPort?.on("message", async (msg: any) => {
  if (!msg || msg.type !== "detect") return;
  const start = Date.now();
  const notes: string[] = [];
  const input: DetectInput = msg.input;

  let functionName = "topUpCollateral";
  try {
    functionName = await decideAction(input, notes);
  } catch (err: any) {
    notes.push(`decision error: ${err?.message}`);
  }

  const body = JSON.stringify({ watcher: identity.id, functionName, hf: input.healthFactor });
  const signature = await wallet.signMessage(body);

  parentPort?.postMessage({
    type: "proposal",
    incidentId: msg.incidentId,
    proposal: {
      watcher: identity,
      functionName,
      functionArgs: [],
      stake: cfg.stake,
      detectionLatencyMs: Date.now() - start,
      submittedAt: new Date().toISOString(),
      signature,
      notes,
    },
  });
});

// Announce readiness so the pool can confirm every watcher actually booted.
parentPort?.postMessage({ type: "ready", identity });
