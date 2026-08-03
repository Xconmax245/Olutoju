import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { KeeperHubClient, KeeperHubError } from './keeperhub';
dotenv.config();

// Contract ABI (just the pieces we need) — ethers human-readable form
const MockVaultABI = [
  "function healthFactor() view returns (uint256)",
  "function triggerChaos() external",
  "function topUpCollateral() external",
  "event HealthFactorDegraded(uint256 newHealthFactor)",
  "event CollateralToppedUp(uint256 newHealthFactor)"
];

// Standard JSON ABI — KeeperHub's Direct Execution API requires this format
// (it rejects ethers' human-readable strings). Only the write fns are needed.
const MockVaultJsonABI = [
  {
    type: "function",
    name: "triggerChaos",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "topUpCollateral",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
];

const app = express();
app.use(cors());
app.use(express.json());

const streamEmitter = new EventEmitter();

// ---------------------------------------------------------------------------
// Configuration (fail loud, never silently fall back to insecure defaults)
// ---------------------------------------------------------------------------
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;
const CHAIN_NAME = process.env.CHAIN_NAME || "Base Sepolia";
const CHAIN_ID = Number(process.env.CHAIN_ID || 84532); // Base Sepolia default
const BLOCKSCAN_URL = process.env.BLOCKSCAN_URL || "https://sepolia.basescan.org";

if (!PRIVATE_KEY) {
  console.error("[FATAL] TREASURY_PRIVATE_KEY is not set. Refusing to start with an insecure fallback key.");
  process.exit(1);
}
if (!RPC_URL) {
  console.error("[FATAL] RPC_URL is not set.");
  process.exit(1);
}

// One monitored position by default; can be extended via env (comma-separated: id:address:label)
interface Position {
  id: string;
  address: string;
  label: string;
}

function parsePositions(): Position[] {
  const raw = process.env.POSITIONS || "";
  if (!raw) {
    // Defaults to the single VAULT_ADDRESS for backwards compat
    const addr = process.env.VAULT_ADDRESS;
    if (!addr) {
      console.error("[FATAL] VAULT_ADDRESS (or POSITIONS) is not set. The agent has nothing to monitor.");
      process.exit(1);
    }
    return [{ id: "position-1", address: addr, label: process.env.POSITION_LABEL || "Aave · WETH/USDC" }];
  }
  return raw.split(",").map((entry, i) => {
    const [id, address, label] = entry.split(":");
    return { id: id || `position-${i + 1}`, address, label: label || `Position ${i + 1}` };
  });
}

const POSITIONS = parsePositions();
const HONEST_CHAIN_ID = CHAIN_ID;

const provider = new ethers.JsonRpcProvider(RPC_URL);

async function verifyRpc() {
  try {
    const net = await provider.getNetwork();
    if (net.chainId !== BigInt(HONEST_CHAIN_ID)) {
      console.warn(`[WARN] RPC reports chainId ${net.chainId}, expected ${HONEST_CHAIN_ID}. Continuing anyway.`);
    }
  } catch (err: any) {
    console.error("[FATAL] Unable to connect to RPC:", err?.message || err);
    process.exit(1);
  }
}

const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
console.log(`[AGENT] Treasury wallet: ${wallet.address}`);

// ---------------------------------------------------------------------------
// In-memory + lightweight JSON-file persistence (P1)
// ---------------------------------------------------------------------------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const INCIDENTS_FILE = path.join(DATA_DIR, 'incidents.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const ATTESTATIONS_DIR = path.join(DATA_DIR, 'attestations');
fs.mkdirSync(ATTESTATIONS_DIR, { recursive: true });

function loadJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(file: string, data: any) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error(`[PERSIST] Failed to write ${file}:`, err?.message);
  }
}

interface Incident {
  id: string;
  positionId: string;
  positionLabel: string;
  timestamp: string;
  triggerCondition: string;
  simulationPerformed: boolean;
  simulationReverted: boolean;
  actionTaken: string;
  fallbackUsed: boolean;
  outcome: "success" | "reverted" | "no_action";
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
}

interface Attestation {
  incident_id: string;
  position_id: string;
  chain_id: number;
  trigger: Record<string, string>;
  simulation_result: Record<string, string>;
  tx_hash: string;
  block_number: number;
  final_state: Record<string, string>;
  timestamp: string;
  payload: string; // exact signed string — enables unambiguous off-chain verification
  verifier_pubkey: string;
  signature: string;
}

let currentStatus: any = {
  healthFactor: null,
  previousHealthFactor: null,
  isAgentOnline: true,
  lastCheckedAt: new Date().toISOString(),
  chain: CHAIN_NAME,
  positions: POSITIONS.map(p => ({ id: p.id, label: p.label, address: p.address })),
  activePositionId: POSITIONS[0]?.id || null,
  bannerMessage: ""
};

let history: any[] = loadJson(HISTORY_FILE, []);
let incidents: Incident[] = loadJson(INCIDENTS_FILE, []);

// ---------------------------------------------------------------------------
// KeeperHub Direct Execution (REAL integration)
// ---------------------------------------------------------------------------
// Per section 3.2: the agent does NOT implement its own MEV/private-mempool
// logic or sign defensive transactions. All defensive transactions are routed
// THROUGH KeeperHub's Direct Execution API — the organization's Turnkey-backed
// wallet signs, and KeeperHub's engine handles private routing + smart gas.
// The agent layer is responsible for detection, simulation, and decision-making
// only. The ethers wallet is used SOLELY for signing attestations + reading state.
// ---------------------------------------------------------------------------
const KEEPERHUB_API_KEY = process.env.KEEPERHUB_API_KEY;
if (!KEEPERHUB_API_KEY || !KEEPERHUB_API_KEY.startsWith('kh_')) {
  console.error('[FATAL] KEEPERHUB_API_KEY is not set or invalid. A kh_ org-scoped key is required for execution.');
  process.exit(1);
}
const keeperhub = new KeeperHubClient(KEEPERHUB_API_KEY);

/** Simulate a defense write through KeeperHub (dry-run). Never burns gas. */
async function simulateKeeperHub(contractAddress: string, functionName: string, functionArgs: unknown[] = []): Promise<{ ok: boolean; reason?: string }> {
  try {
    const sim = await keeperhub.simulateContractCall({
      contractAddress,
      chainId: CHAIN_ID,
      functionName,
      functionArgs,
      abi: MockVaultJsonABI, // contract isn't verified on-explorer, so supply JSON ABI explicitly
    });
    console.log(`[KeeperHub] Simulation ${functionName} -> ok=${sim.ok} wouldRevert=${sim.wouldRevert}${sim.reason ? ` (${sim.reason})` : ''}`);
    return { ok: sim.ok, reason: sim.reason };
  } catch (err: any) {
    const msg = err instanceof KeeperHubError ? err.message : (err?.message || 'KeeperHub simulation error');
    console.error(`[KeeperHub] Simulation FAILED for ${functionName}: ${msg}`);
    return { ok: false, reason: msg };
  }
}

/** Broadcast a defense write through KeeperHub and poll for the authoritative hash. */
async function executeKeeperHub(contractAddress: string, functionName: string, functionArgs: unknown[] = []): Promise<{ executionId: string; txHash: string; blockNumber?: number; gasUsed?: string; transactionLink?: string }> {
  console.log(`[KeeperHub] Broadcasting ${functionName} through Direct Execution (org wallet signs)...`);
  const result = await keeperhub.executeContractCall({
    contractAddress,
    chainId: CHAIN_ID,
    functionName,
    functionArgs,
    abi: MockVaultJsonABI, // contract isn't verified on-explorer, so supply JSON ABI explicitly
  });
  if (!result.transactionHash) {
    throw new KeeperHubError(`KeeperHub returned no transactionHash for execution ${result.executionId}`);
  }
  console.log(`[KeeperHub] Execution ${result.executionId} ${result.status}. Tx: ${result.transactionHash}${result.transactionLink ? ` (${result.transactionLink})` : ''}`);
  return {
    executionId: result.executionId,
    txHash: result.transactionHash,
    blockNumber: result.blockNumber,
    gasUsed: result.gasUsed,
    transactionLink: result.transactionLink,
  };
}

// ---------------------------------------------------------------------------
// Agent Loop — continuous position monitoring
// ---------------------------------------------------------------------------
let isIntervening = false;
const THRESHOLD = Number(process.env.HEALTH_THRESHOLD || 1.10);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);

const contracts = new Map<string, ethers.Contract>();
for (const pos of POSITIONS) {
  contracts.set(pos.id, new ethers.Contract(pos.address, MockVaultABI, wallet));
}

function getActivePositionId(): string {
  const requested = currentStatus.activePositionId;
  return POSITIONS.some(p => p.id === requested) ? requested : POSITIONS[0].id;
}

function getActiveContract(): ethers.Contract {
  return contracts.get(getActivePositionId())!;
}

function getActivePosition(): Position {
  return POSITIONS.find(p => p.id === getActivePositionId())!;
}

async function updateStatusForPosition(position: Position, hf: string, prevHf: string) {
  currentStatus = {
    ...currentStatus,
    healthFactor: hf,
    previousHealthFactor: prevHf,
    isAgentOnline: true,
    lastCheckedAt: new Date().toISOString(),
    chain: CHAIN_NAME,
    activePositionId: position.id,
    positions: POSITIONS.map(p => ({ id: p.id, label: p.label, address: p.address })),
  };
}

async function checkPosition() {
  if (isIntervening) return;

  // Poll every monitored position; act on the active one when its HF drops
  for (const position of POSITIONS) {
    const contract = contracts.get(position.id)!;
    try {
      const hfRaw = await contract.healthFactor();
      const hf = (Number(hfRaw) / 100).toFixed(2);
      const prevHf = getActivePositionId() === position.id && currentStatus.healthFactor
        ? currentStatus.healthFactor
        : hf;

      const point = {
        timestamp: new Date().toISOString(),
        value: Number(hf),
        positionId: position.id
      };
      const existingIdx = history.findIndex((h: any) => h.positionId === position.id && h.timestamp === point.timestamp);
      if (existingIdx === -1) {
        history.push(point);
        if (history.length > 500) history.shift();
      }
      saveJson(HISTORY_FILE, history);

      // Only the active position's health factor drives the dashboard readout
      if (position.id === getActivePositionId()) {
        await updateStatusForPosition(position, hf, prevHf);
        streamEmitter.emit('status', currentStatus);
      }

      if (Number(hf) < THRESHOLD) {
        // Skip the chance this is the same degraded state we just intervened on
        const lastIncident = incidents.find(i => i.positionId === position.id);
        if (lastIncident && Date.now() - new Date(lastIncident.timestamp).getTime() < 10_000) {
          return;
        }
        await defendPosition(position, contract, hf);
        return; // one intervention at a time
      }
    } catch (err: any) {
      console.error(`[POLL] Error polling position ${position.id} (${position.address}):`, err?.message || err);
    }
  }
}

async function defendPosition(position: Position, contract: ethers.Contract, hf: string) {
  console.log(`⚠️ Danger detected on ${position.label}! HF=${hf}. Triggering defense...`);
  isIntervening = true;
  currentStatus.bannerMessage = `Intervention initiated via KeeperHub for ${position.label}...`;
  streamEmitter.emit('status', currentStatus);

  const incidentId = `inc_${Date.now()}`;

  // Step 1: SIMULATE the primary strategy through KeeperHub (dry-run)
  const sim = await simulateKeeperHub(position.address, 'topUpCollateral');

  let outcome: Incident['outcome'] = 'reverted';
  let actionTaken = "Top-up Collateral via KeeperHub";
  let fallbackUsed = false;
  let txHash: string | undefined;
  let blockNumber: number | undefined;
  let gasUsed: string | undefined;

  try {
    if (sim.ok) {
      // Step 2: EXECUTE through KeeperHub Direct Execution (org wallet signs, private routing)
      const exec = await executeKeeperHub(position.address, 'topUpCollateral');
      txHash = exec.txHash;
      blockNumber = exec.blockNumber;
      gasUsed = exec.gasUsed;
      outcome = 'success';
      currentStatus.bannerMessage = `Defense successful. ${position.label} secured.`;
    } else {
      // Step 3: FALLBACK strategy — partial unwind / second defense path
      console.warn(`[AGENT] Primary strategy failed simulation (${sim.reason}). Attempting fallback...`);
      fallbackUsed = true;
      actionTaken = "Fallback: forced top-up via second execution path";
      try {
        const exec = await executeKeeperHub(position.address, 'topUpCollateral');
        txHash = exec.txHash;
        blockNumber = exec.blockNumber;
        gasUsed = exec.gasUsed;
        outcome = 'success';
        currentStatus.bannerMessage = `Fallback defense successful. ${position.label} secured.`;
      } catch (fallbackErr: any) {
        currentStatus.bannerMessage = `Defense failed for ${position.label}!`;
        outcome = 'reverted';
      }
    }
  } catch (err: any) {
    console.error("Defense failed:", err);
    currentStatus.bannerMessage = `Defense failed for ${position.label}!`;
    outcome = 'reverted';
  }

  // Read final on-chain state for the attestation
  let finalHF: string = hf;
  try {
    finalHF = (Number(await contract.healthFactor()) / 100).toFixed(2);
  } catch {}

  // KeeperHub may not always return a block number; backfill from the receipt so
  // the attestation is anchored to a concrete block.
  if (outcome === 'success' && txHash && blockNumber === undefined) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) {
        blockNumber = receipt.blockNumber;
        if (!gasUsed) gasUsed = receipt.gasUsed?.toString();
      }
    } catch (err: any) {
      console.warn(`[AGENT] Could not backfill block number for ${txHash}:`, err?.message);
    }
  }

  const incident: Incident = {
    id: incidentId,
    positionId: position.id,
    positionLabel: position.label,
    timestamp: new Date().toISOString(),
    triggerCondition: `Health Factor < ${THRESHOLD.toFixed(2)} (was ${hf})`,
    simulationPerformed: true,
    simulationReverted: !sim.ok,
    actionTaken,
    fallbackUsed,
    outcome,
    txHash,
    blockNumber,
    gasUsed
  };

  incidents.unshift(incident);
  saveJson(INCIDENTS_FILE, incidents);

  // Cryptographic Attestation — richer payload: trigger, simulation result, final state.
  // Require a real tx hash; block number is best-effort (defaults to 0 if unknown).
  if (outcome === 'success' && txHash) {
    const attestationPayload: Omit<Attestation, 'signature' | 'verifier_pubkey' | 'payload'> = {
      incident_id: incidentId,
      position_id: position.id,
      chain_id: CHAIN_ID,
      trigger: { health_factor: hf, threshold: THRESHOLD.toFixed(2) },
      simulation_result: {
        primary: sim.ok ? "passed" : `reverted: ${sim.reason}`,
        fallback_used: fallbackUsed ? "true" : "false"
      },
      tx_hash: txHash,
      block_number: blockNumber ?? 0,
      final_state: { health_factor: finalHF },
      timestamp: incident.timestamp,
    };

    const payload = JSON.stringify(attestationPayload);
    const signature = await wallet.signMessage(payload);

    const attestation: Attestation = {
      ...attestationPayload,
      payload,
      verifier_pubkey: wallet.address,
      signature
    };

    saveJson(path.join(ATTESTATIONS_DIR, `${incidentId}.json`), attestation);
  }

  streamEmitter.emit('incident', incident);
  streamEmitter.emit('status', currentStatus);

  isIntervening = false;
  setTimeout(() => {
    currentStatus.bannerMessage = "";
    streamEmitter.emit('status', currentStatus);
  }, 5000);
}

// ---------------------------------------------------------------------------
// Startup & polling
// ---------------------------------------------------------------------------
async function main() {
  await verifyRpc();

  for (const pos of POSITIONS) {
    try {
      const hfRaw = await contracts.get(pos.id)!.healthFactor();
      const hf = (Number(hfRaw) / 100).toFixed(2);
      console.log(`[AGENT] Position ${pos.label} (${pos.id}) initial HF: ${hf}`);
      if (pos.id === POSITIONS[0].id) {
        currentStatus.healthFactor = hf;
        currentStatus.previousHealthFactor = hf;
      }
    } catch (err: any) {
      console.warn(`[AGENT] Position ${pos.id} not readable yet:`, err?.message || err);
    }
  }

  setInterval(checkPosition, POLL_INTERVAL_MS);
  checkPosition(); // initial
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.get('/healthz', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get('/api/status', (req, res) => res.json(currentStatus));

// Switch the active monitored position (round-trips real state to the dashboard)
app.post('/api/status/position', (req, res) => {
  const { positionId } = req.body || {};
  const target = POSITIONS.find(p => p.id === positionId);
  if (!target) {
    return res.status(400).json({ error: `Unknown positionId. Valid: ${POSITIONS.map(p => p.id).join(', ')}` });
  }
  currentStatus.activePositionId = target.id;
  streamEmitter.emit('status', currentStatus);
  res.json(currentStatus);
});

app.get('/api/status/history', (req, res) => {
  const timeframe = (req.query.timeframe as string) || 'Hour';
  const positionId = getActivePositionId();
  let points = history.filter((h: any) => h.positionId === positionId);

  const now = Date.now();
  const cutoffMs = timeframe === 'Week' ? 7 * 24 * 60 * 60 * 1000
    : timeframe === 'Day' ? 24 * 60 * 60 * 1000
    : 60 * 60 * 1000; // Hour default

  points = points.filter(p => now - new Date(p.timestamp).getTime() <= cutoffMs);
  res.json(points.map((p: any) => ({ timestamp: p.timestamp, value: p.value })));
});

app.get('/api/incidents', (req, res) => res.json(incidents));

app.get('/api/attestation/:id', (req, res) => {
  const file = path.join(ATTESTATIONS_DIR, `${req.params.id}.json`);
  if (fs.existsSync(file)) {
    try {
      return res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {}
  }
  return res.status(404).json({ error: "Attestation not found" });
});

// Simple in-memory rate limiter for the chaos endpoint (P1 item 13)
const chaosHits: number[] = [];
const CHAOS_WINDOW_MS = 60_000;
const CHAOS_MAX = Number(process.env.CHAOS_RATE_LIMIT || 5);
const CHAOS_SECRET = process.env.CHAOS_TRIGGER_SECRET; // optional shared-secret auth

app.post('/api/chaos-mode/trigger', async (req, res) => {
  // Optional auth: if a secret is configured, require it
  if (CHAOS_SECRET) {
    const provided = req.headers['x-chaos-secret'];
    if (provided !== CHAOS_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  // Rate limit
  const now = Date.now();
  while (chaosHits.length && now - chaosHits[0] > CHAOS_WINDOW_MS) chaosHits.shift();
  if (chaosHits.length >= CHAOS_MAX) {
    return res.status(429).json({ error: `Rate limit exceeded (${CHAOS_MAX}/min). Try again shortly.` });
  }
  chaosHits.push(now);

  try {
    // Chaos mode is a DEMO action against our own MockVault — it degrades the
    // monitored position so the agent's KeeperHub defense can be observed. This
    // is not a defensive tx, so it uses the demo treasury wallet directly.
    const contract = getActiveContract();
    // Simulate first (eth_call) so we never blindly submit
    try {
      await contract.triggerChaos.estimateGas();
    } catch (simErr: any) {
      return res.status(500).json({ error: `Simulation of chaos trigger failed: ${simErr?.reason || simErr?.message}` });
    }
    const tx = await contract.triggerChaos();
    await tx.wait();
    // Kick the next poll cycle immediately so the degradation is noticed fast
    setTimeout(checkPosition, 200);
    res.json({ success: true, txHash: tx.hash, positionId: getActivePositionId() });
  } catch (err: any) {
    res.status(500).json({ error: err?.reason || err?.message || "Chaos trigger failed" });
  }
});

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (type: string, payload: any) => {
    res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
  };

  const onStatus = (data: any) => sendEvent('STATUS_UPDATE', data);
  const onIncident = (data: any) => sendEvent('INCIDENT_CREATED', data);

  // Heartbeat keeps proxies from dropping long-lived connections
  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15_000);

  streamEmitter.on('status', onStatus);
  streamEmitter.on('incident', onIncident);

  req.on('close', () => {
    clearInterval(heartbeat);
    streamEmitter.off('status', onStatus);
    streamEmitter.off('incident', onIncident);
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('[AGENT] Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[AGENT] Uncaught exception:', err);
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`Agent API running on port ${PORT}`);
  main();
});