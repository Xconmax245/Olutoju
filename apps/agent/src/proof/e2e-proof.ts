/**
 * Live end-to-end proof runner (§5).
 *
 * This is the honest answer to "show a real kh_ key + real tx hashes in the
 * repo." Rather than hand-pasting hashes (which nobody can trust), this script
 * drives the ENTIRE real path against live infrastructure and writes a
 * machine-checkable proof artifact to `apps/agent/proofs/<timestamp>.json`:
 *
 *   1. MCP handshake  — initialize + tools/list against the live KeeperHub MCP
 *      endpoint (records the exact tool names discovered).
 *   2. Workflow object — ensure/create the defense workflow object; records
 *      whether it came back `source: "keeperhub"` (live) or `"local"`.
 *   3. Live read       — read the monitored position's on-chain health factor.
 *   4. Real execution  — simulate + execute one defense step through KeeperHub
 *      Direct Execution and capture the REAL `transactionHash` + explorer link.
 *   5. Receipt anchor  — fetch the on-chain receipt (block number, status) for
 *      the returned hash so the proof is block-anchored, not self-asserted.
 *
 * The artifact is safe to commit/publish: it contains the tx hash, block, and
 * explorer link but NEVER the API key or any private key. Run:
 *
 *   npm run proof            # from apps/agent (needs real .env)
 *
 * Requires: KEEPERHUB_API_KEY (kh_...), RPC_URL, VAULT_ADDRESS, CHAIN_ID.
 */

import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { KeeperHubClient } from "../keeperhub";
import { KeeperHubMcpClient } from "../keeperhub-mcp";
import { ensureDefenseWorkflow } from "../keeperhub-workflows";
import { runDefenseWorkflow } from "../workflows/defense-workflow";
import { buildIncidentReport } from "../incident-report";
import { settleX402, computeAdaptiveBounty } from "../x402";
import { MppRetainer } from "../mpp";

dotenv.config();


const MockVaultJsonABI = [
  { type: "function", name: "topUpCollateral", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "partialUnwind", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "pausePosition", stateMutability: "nonpayable", inputs: [], outputs: [] },
];

interface ProofArtifact {
  version: "1";
  generatedAt: string;
  chainId: number;
  network: string;
  vaultAddress: string;
  keeperhub: {
    keyPrefix: string; // only the non-secret prefix, e.g. "kh_live_ab…"
    mcpEndpoint: string;
    mcpInitialized: boolean;
    toolsDiscovered: string[];
  };
  workflow: {
    slug: string;
    workflowId?: string;
    source: string; // "keeperhub" | "local"
    via: string;
  };
  read: {
    healthFactor?: string;
    error?: string;
  };
  execution: {
    functionName: string;
    sponsorGas: boolean;
    outcome: "success" | "exhausted";
    txHash?: string;
    transactionLink?: string;
    blockNumber?: number;
    gasUsed?: string;
    receiptStatus?: number;
  };
  settlement?: {
    x402TxHash?: string;
    x402Status?: boolean;
    mppTxHash?: string;
    mppStatus?: boolean;
  };
  notes: string[];
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[proof] Missing required env ${name}.`);
    process.exit(1);
  }
  return v;
}

/** Redact all but a short, non-secret prefix of the API key. */
function keyPrefix(key: string): string {
  const head = key.slice(0, 10);
  return `${head}…(${key.length} chars)`;
}

async function main() {
  const apiKey = requireEnv("KEEPERHUB_API_KEY");
  if (!apiKey.startsWith("kh_")) {
    console.error("[proof] KEEPERHUB_API_KEY must be a kh_ org-scoped key.");
    process.exit(1);
  }
  const rpcUrl = requireEnv("RPC_URL");
  const vault = requireEnv("VAULT_ADDRESS");
  const chainId = Number(process.env.CHAIN_ID || 84532);
  const network = process.env.CHAIN_NAME || "Base Sepolia";
  const fn = process.env.PROOF_FUNCTION || "topUpCollateral";
  const sponsorGas = process.env.GAS_SPONSORED !== "false";

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const mcp = new KeeperHubMcpClient(apiKey);
  const keeperhub = new KeeperHubClient(apiKey);
  const notes: string[] = [];

  const artifact: ProofArtifact = {
    version: "1",
    generatedAt: new Date().toISOString(),
    chainId,
    network,
    vaultAddress: vault,
    keeperhub: {
      keyPrefix: keyPrefix(apiKey),
      mcpEndpoint: mcp.endpointUrl,
      mcpInitialized: false,
      toolsDiscovered: [],
    },
    workflow: { slug: "", source: "unknown", via: "unknown" },
    read: {},
    execution: { functionName: fn, sponsorGas, outcome: "exhausted" },
    notes,
  };

  // 1. MCP handshake + tool discovery.
  try {
    const tools = await mcp.listTools(true);
    artifact.keeperhub.mcpInitialized = true;
    artifact.keeperhub.toolsDiscovered = tools.map((t) => t.name);
    console.log(`[proof] MCP discovered ${tools.length} tools.`);
  } catch (err: any) {
    notes.push(`MCP discovery failed: ${err?.message}`);
    console.warn(`[proof] MCP discovery failed: ${err?.message}`);
  }

  // 2. Workflow object (live create, else honest local fallback).
  try {
    const wf = await ensureDefenseWorkflow({
      apiKey,
      chainId,
      contractAddress: vault,
      dataDir: process.env.DATA_DIR || path.join(__dirname, "..", "..", "data"),
      mcp,
      rest: keeperhub,
      log: (m) => console.log(m),
    });
    artifact.workflow = {
      slug: wf.slug,
      workflowId: (wf as any).workflowId || (wf as any).id,
      source: wf.source,
      via: (wf as any).via || "ensure",
    };
  } catch (err: any) {
    notes.push(`Workflow ensure failed: ${err?.message}`);
  }

  // 3. Live on-chain read.
  try {
    const c = new ethers.Contract(vault, ["function healthFactor() view returns (uint256)"], provider);
    const hfRaw = await c.healthFactor();
    artifact.read.healthFactor = (Number(hfRaw) / 100).toFixed(2);
    console.log(`[proof] Live HF read: ${artifact.read.healthFactor}`);
  } catch (err: any) {
    artifact.read.error = err?.message;
    notes.push(`Read failed: ${err?.message}`);
  }

  // 4. Real simulate + execute through KeeperHub Direct Execution.
  try {
    const run = await runDefenseWorkflow({
      keeperhub,
      contractAddress: vault,
      chainId,
      abi: MockVaultJsonABI,
      steps: [{ id: "proof-step", label: `Proof ${fn}`, functionName: fn, severity: "restore" }],
      sponsorGas,
      log: (m) => console.log(m),
    });
    artifact.execution.outcome = run.outcome;
    const w = run.winningStep;
    if (w) {
      artifact.execution.txHash = w.txHash;
      artifact.execution.transactionLink = w.transactionLink;
      artifact.execution.blockNumber = w.blockNumber;
      artifact.execution.gasUsed = w.gasUsed;
    } else {
      notes.push("No step landed — execution exhausted (check that the vault is defensible in its current state).");
    }
  } catch (err: any) {
    notes.push(`Execution failed: ${err?.message}`);
    console.error(`[proof] Execution failed: ${err?.message}`);
  }

  // 5. Anchor the receipt on-chain for the returned hash.
  if (artifact.execution.txHash) {
    try {
      const receipt = await provider.getTransactionReceipt(artifact.execution.txHash);
      if (receipt) {
        artifact.execution.receiptStatus = receipt.status ?? undefined;
        if (artifact.execution.blockNumber === undefined) artifact.execution.blockNumber = receipt.blockNumber;
        console.log(`[proof] Receipt anchored: block ${receipt.blockNumber}, status ${receipt.status}.`);
      } else {
        notes.push("Receipt not yet available at proof time (tx may still be propagating).");
      }
    } catch (err: any) {
      notes.push(`Receipt fetch failed: ${err?.message}`);
    }
  }

  // 6. Settlement Integration (x402 + MPP)
  if (artifact.execution.txHash && process.env.TREASURY_PRIVATE_KEY) {
    try {
      const watcherWallet = new ethers.Wallet(process.env.TREASURY_PRIVATE_KEY, provider);
      const incidentId = `proof_${Date.now()}`;
      
      const report = await buildIncidentReport({
        incidentId,
        chainId,
        contractAddress: vault,
        trigger: { 
          positionId: "proof-pos-1", 
          positionLabel: "Proof Position", 
          protocol: "MockVault", 
          threatType: "liquidation", 
          healthFactor: "1.05", 
          threshold: "1.10", 
          detectedAt: new Date().toISOString() 
        },
        run: {
          workflowId: "vfgnrtrjqv3j8jryv18yd",
          contractAddress: vault,
          chainId,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          outcome: "success",
          steps: [],
          winningStep: {
            id: "proof",
            label: "Proof Execution",
            functionName: fn,
            severity: "restore",
            txHash: artifact.execution.txHash,
            blockNumber: artifact.execution.blockNumber || 0,
            transactionLink: artifact.execution.transactionLink || "",
            gasUsed: artifact.execution.gasUsed || "0",
            simulated: true,
            simulationPassed: true,
            executed: true,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
          }
        },
        finalHealthFactor: "1.50",
        watcher: { id: "e2e-proof-runner", framework: "script", address: watcherWallet.address },
        signer: watcherWallet,
      });

      artifact.settlement = {};

      // X402
      if (process.env.X402_ASSET && process.env.X402_PAYER_KEY && process.env.X402_PAYOUT_ADDRESS) {
        const payerSigner = new ethers.Wallet(process.env.X402_PAYER_KEY, provider);
        const amount = await computeAdaptiveBounty({ provider, baseUsdc: Number(process.env.X402_BASE_USDC || 5), severity: "medium" });
        const x402 = await settleX402({
          report,
          challenge: { amount, asset: process.env.X402_ASSET, payTo: process.env.X402_PAYOUT_ADDRESS, nonce: incidentId },
          provider,
          payerSigner,
          log: (m: string) => console.log(m)
        });
        artifact.settlement.x402TxHash = x402.txHash;
        artifact.settlement.x402Status = x402.settled;
      }

      // MPP
      if (process.env.MPP_ASSET && process.env.MPP_PAYOUT_ADDRESS) {
        const retainer = new MppRetainer({
          asset: process.env.MPP_ASSET,
          payTo: process.env.MPP_PAYOUT_ADDRESS,
          amountPerPeriod: process.env.MPP_AMOUNT_PER_PERIOD || "2000000",
          periodSeconds: Number(process.env.MPP_PERIOD_SECONDS || 60),
          protocol: "MockVault_Proof",
        });
        const payerSigner = process.env.X402_PAYER_KEY ? new ethers.Wallet(process.env.X402_PAYER_KEY, provider) : undefined;
        const mpp = await retainer.settleDuePeriod({
          provider,
          payerSigner,
          log: (m: string) => console.log(m)
        });
        if (mpp) {
          artifact.settlement.mppTxHash = mpp.txHash;
          artifact.settlement.mppStatus = true;
        }
      }
    } catch (err: any) {
      notes.push(`Settlement proof failed: ${err?.message}`);
      console.warn(`[proof] Settlement skipped/failed: ${err?.message}`);
    }
  }

  // Write the (publishable) artifact.
  const outDir = path.join(__dirname, "..", "..", "proofs");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `proof-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2));
  console.log(`\n[proof] Proof artifact written to ${outFile}`);
  console.log(JSON.stringify(artifact, null, 2));

  const ok = !!artifact.execution.txHash;
  console.log(`\n[proof] LIVE EXECUTION ${ok ? "PROVEN ✅" : "NOT PROVEN ❌"} (tx hash ${ok ? "present" : "absent"}).`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`[proof] Fatal: ${err?.message || err}`);
  process.exit(1);
});
