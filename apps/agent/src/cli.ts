#!/usr/bin/env node
/**
 * Sentinel CLI (§1.9) — a framework-agnostic operator surface over the same
 * KeeperHub integrations the agent uses. This makes the "CLI surface" real
 * rather than aspirational: every command below drives an actual code path
 * (MCP discovery, workflow authoring, mesh race, protocol adapters, gas-
 * sponsored Direct Execution, attestation verification).
 *
 * Usage (from apps/agent):
 *   npm run cli -- <command> [flags]
 *
 * Commands:
 *   mcp:tools                       List KeeperHub tools discovered over MCP.
 *   workflows:list                  List workflow objects (MCP → REST → local).
 *   workflows:create --vault 0x..   Ensure a defense workflow object exists.
 *   mesh:race --hf 1.03             Run a watcher race for a hypothetical HF.
 *   read --protocol aave --pool ..  Read a live position's health factor.
 *   execute --vault 0x.. --fn topUpCollateral [--no-sponsor]
 *                                   Simulate+execute one defense step (gas-sponsored).
 *   verify <attestationFile.json>   Verify a saved incident attestation offline.
 *
 * The CLI never signs or broadcasts a defense itself — execution always flows
 * through KeeperHub, exactly like the agent.
 */

import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { KeeperHubClient } from "./keeperhub";
import { KeeperHubMcpClient } from "./keeperhub-mcp";
import { ensureDefenseWorkflow, listDefenseWorkflows } from "./keeperhub-workflows";
import { runDefenseWorkflow } from "./workflows/defense-workflow";
import { WatcherPool } from "./mesh/watcher-pool";
import { buildFleetConfigs } from "./mesh/watchers";
import { runRace } from "./mesh/race-coordinator";
import { buildAdapter, classify } from "./detection";
import { verifyIncidentReport, IncidentReport } from "./incident-report";

dotenv.config();

const MockVaultJsonABI = [
  { type: "function", name: "topUpCollateral", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "partialUnwind", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "pausePosition", stateMutability: "nonpayable", inputs: [], outputs: [] },
];

/** Minimal flag parser: --key value / --flag (boolean). */
function parseFlags(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function requireApiKey(): string {
  const key = process.env.KEEPERHUB_API_KEY;
  if (!key || !key.startsWith("kh_")) {
    console.error("[CLI] KEEPERHUB_API_KEY (kh_...) is required for this command.");
    process.exit(1);
  }
  return key;
}

function requireChainId(): number {
  return Number(process.env.CHAIN_ID || 84532);
}

function provider(): ethers.JsonRpcProvider {
  const rpc = process.env.RPC_URL;
  if (!rpc) {
    console.error("[CLI] RPC_URL is required for this command.");
    process.exit(1);
  }
  return new ethers.JsonRpcProvider(rpc);
}

async function cmdMcpTools() {
  const mcp = new KeeperHubMcpClient(requireApiKey());
  const tools = await mcp.listTools(true);
  console.log(`Endpoint: ${mcp.endpointUrl}`);
  console.log(`Discovered ${tools.length} tools:`);
  for (const t of tools) console.log(`  • ${t.name}${t.description ? ` — ${t.description}` : ""}`);
}

async function cmdWorkflowsList() {
  const apiKey = requireApiKey();
  const rest = new KeeperHubClient(apiKey);
  const mcp = new KeeperHubMcpClient(apiKey);
  const res = await listDefenseWorkflows({
    apiKey,
    dataDir: process.env.DATA_DIR || path.join(__dirname, "..", "data"),
    mcp,
    rest,
    log: (m) => console.log(m),
  });
  console.log(`Source: ${res.source} (via ${res.via}). ${res.workflows.length} workflow(s):`);
  console.log(JSON.stringify(res.workflows, null, 2));
}

async function cmdWorkflowsCreate(flags: Record<string, string | boolean>) {
  const apiKey = requireApiKey();
  const vault = String(flags.vault || process.env.VAULT_ADDRESS || "");
  if (!vault) return console.error("[CLI] --vault (or VAULT_ADDRESS) is required.");
  const wf = await ensureDefenseWorkflow({
    apiKey,
    chainId: requireChainId(),
    contractAddress: vault,
    dataDir: process.env.DATA_DIR || path.join(__dirname, "..", "data"),
    mcp: new KeeperHubMcpClient(apiKey),
    rest: new KeeperHubClient(apiKey),
    log: (m) => console.log(m),
  });
  console.log(JSON.stringify(wf, null, 2));
}

async function cmdMeshRace(flags: Record<string, string | boolean>) {
  const apiKey = requireApiKey();
  const hf = Number(flags.hf || 1.03);
  const threshold = Number(flags.threshold || process.env.HEALTH_THRESHOLD || 1.1);
  const vault = String(flags.vault || process.env.VAULT_ADDRESS || "");
  const mcp = new KeeperHubMcpClient(apiKey);
  const pool = new WatcherPool({
    configs: buildFleetConfigs(process.env),
    apiKey,
    mcp,
    log: (m) => console.log(m),
  });
  const batch = await pool.propose({ healthFactor: hf, threshold, primaryBlocked: !!flags.blocked });
  console.log(`\nMode: ${batch.mode}. Independent worker watchers: ${batch.readyWatchers.join(", ") || "(none)"}`);
  console.log(`Proposals:`);
  for (const p of batch.proposals) {
    console.log(`  • ${p.watcher.id} (${p.watcher.framework}) → ${p.functionName} [${p.detectionLatencyMs}ms]`);
  }
  if (vault) {
    const race = await runRace({
      keeperhub: new KeeperHubClient(apiKey),
      contractAddress: vault,
      chainId: requireChainId(),
      abi: MockVaultJsonABI,
      proposals: batch.proposals,
      log: (m) => console.log(m),
    });
    console.log(`\nWinner: ${race.winner ? `${race.winner.watcher.id} → ${race.winner.functionName}` : "(none)"}`);
  } else {
    console.log("\n(Provide --vault to simulate + rank proposals through KeeperHub.)");
  }
  await pool.shutdown();
}

async function cmdRead(flags: Record<string, string | boolean>) {
  const p = provider();
  const protocol = String(flags.protocol || "mock");
  const threshold = Number(flags.threshold || process.env.HEALTH_THRESHOLD || 1.1);
  let contract: ethers.Contract | undefined;
  if (protocol === "mock") {
    const vault = String(flags.vault || process.env.VAULT_ADDRESS || "");
    if (!vault) return console.error("[CLI] --vault is required for protocol=mock.");
    contract = new ethers.Contract(vault, ["function healthFactor() view returns (uint256)", "function paused() view returns (bool)"], p);
  }
  const adapter = buildAdapter({
    protocol,
    provider: p,
    contract,
    aavePool: flags.pool ? String(flags.pool) : process.env.AAVE_POOL,
    morpho: flags.morpho ? String(flags.morpho) : process.env.MORPHO,
    marketId: flags.marketId ? String(flags.marketId) : process.env.MORPHO_MARKET_ID,
    oracle: flags.oracle ? String(flags.oracle) : process.env.MORPHO_ORACLE,
    user: flags.user ? String(flags.user) : process.env.POSITION_USER,
  });
  const reading = await adapter.read();
  const detection = classify(reading, threshold);
  console.log(`Protocol: ${adapter.protocol}`);
  console.log(`Health factor: ${reading.healthFactor}`);
  console.log(`Detection: ${detection.severity} — ${detection.reason}`);
  console.log(`Raw: ${JSON.stringify(reading.raw)}`);
}

async function cmdExecute(flags: Record<string, string | boolean>) {
  const apiKey = requireApiKey();
  const vault = String(flags.vault || process.env.VAULT_ADDRESS || "");
  const fn = String(flags.fn || "topUpCollateral");
  if (!vault) return console.error("[CLI] --vault (or VAULT_ADDRESS) is required.");
  const sponsorGas = flags["no-sponsor"] ? false : process.env.GAS_SPONSORED !== "false";
  const run = await runDefenseWorkflow({
    keeperhub: new KeeperHubClient(apiKey),
    contractAddress: vault,
    chainId: requireChainId(),
    abi: MockVaultJsonABI,
    steps: [{ id: "cli-step", label: `CLI ${fn}`, functionName: fn, severity: "restore" }],
    sponsorGas,
    log: (m) => console.log(m),
  });
  console.log(JSON.stringify({ outcome: run.outcome, winningStep: run.winningStep }, null, 2));
}

function cmdVerify(file: string) {
  if (!file || !fs.existsSync(file)) {
    console.error(`[CLI] Attestation file not found: ${file}`);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(file, "utf8")) as IncidentReport;
  if (!(report as any).digest || !(report as any).signature) {
    console.error("[CLI] Not a verifiable v1 attestation (missing digest/signature).");
    process.exit(1);
  }
  const result = verifyIncidentReport(report);
  console.log(JSON.stringify({ incidentId: report.incidentId, ...result }, null, 2));
  process.exit(result.valid ? 0 : 2);
}

function usage() {
  console.log(`Sentinel CLI — KeeperHub-native operator surface

Commands:
  mcp:tools
  workflows:list
  workflows:create --vault 0x...
  mesh:race --hf 1.03 [--threshold 1.1] [--vault 0x...] [--blocked]
  read --protocol <mock|aave|morpho> [--vault|--pool|--morpho|--marketId|--oracle|--user ...]
  execute --vault 0x... --fn topUpCollateral [--no-sponsor]
  verify <attestation.json>
`);
}

async function main() {
  const [, , command, ...rest] = process.argv;
  const flags = parseFlags(rest);
  try {
    switch (command) {
      case "mcp:tools": return await cmdMcpTools();
      case "workflows:list": return await cmdWorkflowsList();
      case "workflows:create": return await cmdWorkflowsCreate(flags);
      case "mesh:race": return await cmdMeshRace(flags);
      case "read": return await cmdRead(flags);
      case "execute": return await cmdExecute(flags);
      case "verify": return cmdVerify(rest[0]);
      default:
        usage();
        process.exit(command ? 1 : 0);
    }
  } catch (err: any) {
    console.error(`[CLI] Error: ${err?.message || err}`);
    process.exit(1);
  }
}

main();
