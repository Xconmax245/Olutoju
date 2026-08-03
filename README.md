# Olutoju (The Guardian) 🛡️

**Olutoju** (meaning "The Guardian" or "Caretaker" in Yoruba) is an autonomous, cryptographically secure DeFi position monitoring and defense system. It continuously watches the health of on-chain collateralized debt positions (CDPs) and uses **KeeperHub** for direct, private-mempool execution of defensive transactions when health factors degrade below critical thresholds. 

The system features real-time monitoring, cryptographic incident attestations, and a gorgeous live dashboard for operators to oversee the autonomous agent's activity.

---

## ✅ Verified On-Chain Proof

The KeeperHub **Direct Execution** rail is verified with two real transactions on public Base Sepolia. KeeperHub's own organization wallet (`0x6331eb45...`) signed and routed both — the agent treasury wallet never signs defensive transactions.

| # | tx hash | block | function | status |
|---|---|---|---|---|
| 1 | [`0x400d30e2...e63fa3`](https://sepolia.basescan.org/tx/0x400d30e2de6482247249829cfbfbe2a4bc906a82ced3b1a7bf0d2c8f22e63fa3) | [44974210](https://sepolia.basescan.org/block/44974210) | `topUpCollateral` | ✅ Success |
| 2 | [`0x04dcac8b...39204`](https://sepolia.basescan.org/tx/0x04dcac8b6abc1ba45edaa916a89fbdcf98d811e964be7f514c7b01354ab39204) | [44979064](https://sepolia.basescan.org/block/44979064) | `topUpCollateral` | ✅ Success |

**Contract (MockVault):** [`0x6f3A57f763e54dAED307433E86fa1AfE840c3f09`](https://sepolia.basescan.org/address/0x6f3A57f763e54dAED307433E86fa1AfE840c3f09) — deployed 2026-08-02, Base Sepolia (chain 84532).

**What is and isn't claimed at this point:**
- ✅ **KeeperHub Direct Execution** — verified. Both hashes show KeeperHub's execution wallet as `From`, not the agent treasury. `executionId: yhkreq0jd7nll5v78dswu` is a KeeperHub-issued identifier, not a local artefact.
- ✅ **KeeperHub MCP `tools/list`** — verified. The agent calls `initialize` → `tools/list` against `https://app.keeperhub.com/mcp` at startup and logs the discovered tool names (visible at `GET /api/mcp/tools`).
- ✅ **KeeperHub MCP `tools/call`** — implemented (P0.3). On every incident the MCP-native watcher calls `tools/list` then searches for a simulate/execute tool and makes a real `tools/call` round-trip. If the live server exposes a matching tool, the call result drives the action chosen; if not, the watcher logs all discovered tool names and falls back to local policy. Set `KEEPERHUB_MCP_SIMULATE_TOOL=<name>` to pin the exact tool name for your org.
- ✅ **Signed attestation** — verified. Attestation `inc_1785726412321` (block 44979064) is signed at `0xe4cf2346C94d6Eb91d14FD4Ac63f85Fd3717c69c` and independently verifiable via `GET /api/attestation/inc_1785726412321/verify`.

---

## 🏗️ Architecture

Olutoju is built as a modern monorepo (using npm workspaces) and consists of three core applications:

1. **`apps/agent` (The Autonomous Sentinel)**
   - A Node.js / Express backend that actively polls on-chain positions (like Aave or Compound vaults).
   - Monitors the Health Factor (HF) of positions.
   - When HF drops below a threshold, it simulates and routes defensive transactions (e.g., `topUpCollateral`) securely through **KeeperHub's Direct Execution API**.
   - Generates cryptographic attestations (signed payloads) for every incident, creating an verifiable audit trail of why the agent intervened and the final on-chain state.

2. **`apps/contracts` (The Smart Contract Environment)**
   - A Hardhat-based environment used for local development and testing.
   - Contains a `MockVault` contract that simulates a collateralized debt position.
   - Includes a "Chaos Mode" (`triggerChaos`) to intentionally degrade the health factor and test the agent's real-time response.

3. **`apps/web` (The Command Center)**
   - A sleek, responsive Next.js web application.
   - Serves as the landing page and live operator dashboard.
   - Connects to the Agent via Server-Sent Events (SSE) to display real-time health factors, incident logs, and cryptographic attestations.

---

## ✨ Core Features

- **Autonomous Defense**: Zero-latency monitoring and execution. When a vault enters the danger zone, Olutoju intervenes automatically.
- **KeeperHub Integration**: Never broadcasts defensive transactions to the public mempool. Routes through KeeperHub Direct Execution for MEV protection and smart gas pricing (the agent never self-signs defensive txs).
- **Multi-Step Defense Workflow**: A defense is an *escalating sequence* — `topUpCollateral` → `partialUnwind` → `pausePosition` — where each step is simulated through KeeperHub and only executed if the simulation passes. If a step fails simulation, the system transparently escalates to the next louder step (no silent same-call retries).
- **Verifiable Incident Reports**: Every successful defense produces a structured, exportable report built from the full workflow decision path, anchored with a deterministic keccak256 digest + ECDSA signature. Anyone can verify it independently via `GET /api/attestation/:id/verify` — no server trust required.
- **Outcome-Gated x402 Settlement**: The winning watcher is paid a bounty **only after** the incident report's attestation verifies AND the defensive tx receipt is confirmed on-chain with a `secured` final state. Payment is gated on proof, never on a claim. Bounty scales with threat severity and current gas conditions.
- **Deterministic Chaos Mode**: One API call can degrade the position, **force the primary defense to fail simulation** (proving re-planning/escalation), and submit a **competing public-mempool transaction** so the private-routed KeeperHub defense can be shown winning the block-ordering race.
- **Private-Routing Evidence**: Each report compares the private defense block vs. the public competitor block, producing concrete MEV/ordering-protection proof.
- **Live Telemetry**: A Next.js dashboard streaming live metrics via SSE — including `WORKFLOW_STEP`, `INCIDENT_REPORT`, `SETTLEMENT_UPDATE`, `MESH_RACE`, and `RETAINER_UPDATE` events.

---

## 🕸️ Sentinel Mesh — from single guardian to economic network

Olutoju is not just one watcher; it is a **mesh of independent, competing watcher agents** that race to defend a position, coordinated by a simulation-first consensus policy. This is what turns a monitoring bot into a credibly-neutral *defense network*.

- **Multi-watcher race / consensus** (`src/mesh/race-coordinator.ts`): On every incident, a fleet of independent watchers each **independently** propose a defensive action + post a **stake**. Every proposal is validated by a KeeperHub **simulation** (concurrently). The winner is chosen by an explicit, auditable policy — **`first-valid-simulation-wins`** (fastest correct watcher). Only the winner executes and claims the bounty.
- **Stake + slashing economics**: A watcher that proposes an **invalid** action (its simulation reverts) is **slashed**; a watcher that merely arrives second keeps its stake. `slashedStakeTotal` is reported per race.
- **Cross-framework proof** (`src/mesh/watchers.ts`): The default fleet is deliberately heterogeneous — a `raw-node` watcher, an **MCP-native** watcher that discovers KeeperHub tools over the Model Context Protocol before proposing, and a `langchain`-style reasoning watcher. Each signs its **own** proposal with its **own** key, proving genuinely independent identities (none of them sign or broadcast the defensive tx — that stays with KeeperHub).
- **KeeperHub MCP access** (`src/keeperhub-mcp.ts`): A real, dependency-light **Model Context Protocol** client (Streamable-HTTP + JSON-RPC 2.0) that performs `initialize` → `tools/list` → `tools/call`. This is the framework-agnostic seam: `GET /api/mcp/tools` lists exactly what KeeperHub exposes over MCP.
- **KeeperHub Workflow objects** (`src/keeperhub-workflows.ts`): The escalating defense sequence is registered as a **real, addressable KeeperHub workflow object** (via an MCP `create-workflow` tool) with a stable slug — listable at `GET /api/workflows`. Provenance is always honest: each record marks its `source` as `keeperhub` or `local` (durable fallback registry) so nothing is faked.
- **Dual-protocol settlement (x402 + MPP)**: Alongside the event-driven **x402** incident bounty, the mesh also earns a standing **MPP retainer** (`src/mpp.ts`) — a recurring "protection premium" the protocol pays for continuous watching, independent of whether an incident fires. Both settlement rails are surfaced (`GET /api/retainer`), and each records whether it was actually **charged** on-chain vs merely **accrued**.

### Mesh API surface

| Endpoint | Purpose |
| --- | --- |
| `GET /api/mesh` | Watcher fleet + most recent race (proposals, winner, slashing). |
| `GET /api/workflows` | Registered KeeperHub workflow objects (live MCP list, else local registry). |
| `GET /api/mcp/tools` | Tools KeeperHub exposes over MCP (framework-agnostic proof). |
| `GET /api/retainer` | MPP standing-retainer schedule + accrued amount. |

### Architecture

```text
                         ┌───────────────────────────────────────────────┐
                         │              SENTINEL MESH (watchers)          │
                         │  raw-node        mcp (MCP)        langchain    │
                         │     │               │                │        │
                         │     └──── independent proposals + stake ───┐   │
                         └───────────────────────────────────────────┼───┘
                                                                      ▼
   on-chain threat ──▶ detection ──▶  RACE COORDINATOR  (simulate every proposal via KeeperHub)
   (HF drop / oracle       │                │  policy: first-valid-simulation-wins
    deviation / drain)     │                │  invalid proposal → STAKE SLASHED
                           │                ▼
                           │        winner only  ──▶  KeeperHub Direct Execution
                           │                              (org Turnkey wallet signs,
                           │                               private routing + smart gas)
                           ▼                                        │
                  Workflow object (MCP)                             ▼
             topUp → partialUnwind → pause                  on-chain defense tx
                                                                    │
                        ┌───────────────────────────────────────────┤
                        ▼                                           ▼
             Signed Incident Report                    Settlement (dual-protocol)
          (keccak256 digest + ECDSA sig,               • x402 outcome-gated bounty
           independently verifiable)                   • MPP standing retainer
                        │                                           │
                        └──────────────► SSE stream ◄───────────────┘
                                    (Next.js live dashboard)
```

The security invariant is preserved end-to-end: **watchers detect, simulate, propose, and race — but never hold funds and never self-broadcast defenses.** All execution flows through KeeperHub.

### Truly independent watcher processes

The mesh is not "one function called three times in a single event loop." Each watcher boots inside its **own Node.js `worker_thread`** — a separate V8 isolate with its own key material and message loop (`src/mesh/watcher-pool.ts`, `src/mesh/watcher-worker.ts`). On an incident the pool fans the event out to every worker concurrently and collects each worker's **independently-signed** proposal, with a per-watcher timeout so a hung watcher can't stall the race. Provenance is honest: each proposal batch is tagged `mode: "worker" | "inline"`, and the `[Mesh]` log line reports how many independent workers actually booted. Set `MESH_WORKERS=false` to force the in-process fallback.

### Real protocol adapters (not just MockVault)

Detection is protocol-agnostic behind a `PositionAdapter` interface (`src/detection/index.ts`). Three real adapters ship:

| `protocol` | Adapter | Live read |
| --- | --- | --- |
| `mock` | `MockVaultAdapter` | demo vault `healthFactor()` |
| `aave` | `AaveV3Adapter` | Aave V3 Pool `getUserAccountData(user)` → 1e18 HF |
| `morpho` | `MorphoBlueAdapter` | Morpho Blue `position`/`market`/`idToMarketParams` (+ oracle `price()`), deriving `HF = collateral·price·LLTV / borrowed` |

`buildAdapter()` selects the right one from config, so the agent loop never changes when you point it at a real Aave or Morpho position.

### Gas Sponsorship (§1.8)

Defensive executions carry `sponsorGas` so KeeperHub's engine (org paymaster) covers gas — a watcher with an **empty wallet** can still defend. It's on by default and toggled with `GAS_SPONSORED=false` (or `--no-sponsor` on the CLI).

### Sentinel CLI

A framework-agnostic operator surface over the same integrations the agent uses (`src/cli.ts`). Run from `apps/agent`:

```bash
npm run cli -- mcp:tools                         # discover KeeperHub tools over MCP
npm run cli -- workflows:list                    # list workflow objects (MCP → REST → local)
npm run cli -- workflows:create --vault 0x...     # ensure a defense workflow object
npm run cli -- mesh:race --hf 1.03 --vault 0x...  # run a real watcher race + rank via simulation
npm run cli -- read --protocol aave --pool 0x... --user 0x...   # read a live position's HF
npm run cli -- execute --vault 0x... --fn topUpCollateral       # gas-sponsored Direct Execution
npm run cli -- verify apps/agent/data/attestations/<id>.json     # verify an attestation offline
```

Like the agent, the CLI never signs or broadcasts a defense itself — execution always flows through KeeperHub.

---


## 🛠️ Technology Stack

- **Frontend**: Next.js (App Router), React, CSS Modules / Vanilla CSS.
- **Agent/Backend**: Node.js, Express, Ethers.js v6, KeeperHub API.
- **Smart Contracts**: Solidity, Hardhat.
- **Monorepo Management**: npm workspaces.

---

## 📂 Project Structure

```text
olutoju/
├── apps/
│   ├── agent/         # Node.js autonomous agent
│   │   ├── src/       # Agent source code (index.ts, keeperhub.ts)
│   │   └── data/      # JSON persistence & Attestations
│   ├── contracts/     # Hardhat environment
│   │   ├── contracts/ # MockVault.sol
│   │   └── scripts/   # Deployment scripts
│   └── web/           # Next.js Dashboard & Landing Page
│       ├── src/       # Web app source code
│       └── public/    # Static assets
├── package.json       # Workspace root
└── README.md          # You are here
```

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js (v18+)
- npm (v9+)
- A KeeperHub API Key (`kh_...`)
- A funded private key for a testnet (e.g., Base Sepolia)

### 1. Install Dependencies
From the root of the repository, run:
```bash
npm install
```

### 2. Environment Variables
You need to set up environment variables for the Agent. Navigate to `apps/agent` and copy the example file:
```bash
cd apps/agent
cp .env.example .env
```
Open `apps/agent/.env` and configure the following:
```env
# RPC & Wallet Configuration
RPC_URL="https://sepolia.base.org"
TREASURY_PRIVATE_KEY="your_private_key_here"

# KeeperHub Integration
KEEPERHUB_API_KEY="kh_your_keeperhub_api_key"

# (Optional) Contract Address (Will be provided after running deployment script)
# VAULT_ADDRESS="0x..."
```

---

## 🎮 Running the Application Locally

The project provides unified scripts to run the environment. We recommend running the components in separate terminal windows.

### Terminal 1: Local Blockchain & Contracts
Start a local Hardhat node:
```bash
npm run node:local
```

### Terminal 2: Deploy Contracts
In a new terminal, deploy the `MockVault` to your local node:
```bash
npm run deploy:local
```
*Note the deployed contract address. You will need to add it to your `apps/agent/.env` file as `VAULT_ADDRESS=0x...` or pass it as a `POSITIONS` string.*

### Terminal 3: Run the Autonomous Agent
Start the monitoring agent:
```bash
npm run dev:agent
```
The agent will spin up on `http://localhost:4000` and begin polling the vault's health factor.

### Terminal 4: Run the Web Dashboard
Start the Next.js frontend:
```bash
npm run dev:web
```
Navigate to `http://localhost:3000` to see the live dashboard!

---

## 🌪️ Testing Chaos Mode

Want to see Olutoju in action?
1. Open the Web Dashboard at `http://localhost:3000/dashboard`.
2. Click the **"Trigger Chaos"** button on the UI (or hit the `/api/chaos-mode/trigger` endpoint).
3. Watch as the Health Factor drops to `1.05`.
4. Observe the Agent immediately detecting the drop, running the escalating **defense workflow** (simulate → execute each step) via KeeperHub, and restoring the Health Factor.
5. View the resulting incident log and verifiable Incident Report in real-time.

### Deterministic "hard mode" chaos

The chaos endpoint accepts flags that make the demo spectacular **and** reproducible:

```bash
curl -X POST http://localhost:4000/api/chaos-mode/trigger \
  -H "Content-Type: application/json" \
  -d '{ "forcePrimaryFailure": true, "injectPublicCompetitor": true }'
```

- `forcePrimaryFailure: true` — bricks the primary defense (`topUpCollateral`) so its simulation fails and the agent must **escalate** to `partialUnwind` (proves genuine re-planning, not a silent retry).
- `injectPublicCompetitor: true` — fires a competing **public-mempool** transaction so the incident report can prove the KeeperHub **private-routed** defense landed in an equal-or-earlier block.

### Verifying an Incident Report

Every successful defense writes a signed report to `apps/agent/data/attestations/<incidentId>.json`. Verify it independently:

```bash
# Server-side convenience verifier
curl http://localhost:4000/api/attestation/<incidentId>/verify
```

The response reports whether the keccak256 digest matches and whether the recovered ECDSA signer equals the claimed `verifier_pubkey`. You can reproduce this entirely offline with `verifyIncidentReport()` in `apps/agent/src/incident-report.ts` — no trust in our server required.

### x402 outcome-gated bounty (optional)

Set `X402_ASSET`, `X402_PAYER_KEY`, and `X402_PAYOUT_ADDRESS` in `apps/agent/.env` to enable settlement. When configured, the winning watcher is paid a bounty (scaled by severity + gas) **only after** three gates pass: the attestation verifies, the defensive tx receipt is confirmed on-chain, and the final state is `secured`.

---

## 🕸️ Inspecting the Mesh

With the agent running, the mesh is live by default (`MESH_ENABLED=true`). Trigger a chaos incident, then inspect the race and the network's economics:

```bash
# 1. See the watcher fleet + the most recent race (proposals, winner, slashing)
curl http://localhost:4000/api/mesh | jq

# 2. Prove framework-agnostic access: list the tools KeeperHub exposes over MCP
curl http://localhost:4000/api/mcp/tools | jq

# 3. See the escalating defense registered as a real KeeperHub workflow object
curl http://localhost:4000/api/workflows | jq

# 4. Inspect the MPP standing retainer schedule (dual-protocol settlement)
curl http://localhost:4000/api/retainer | jq
```

During an incident the SSE stream (`GET /api/stream`) emits a `MESH_RACE` event containing every watcher's proposal, its simulation result, the ranked winner, and `slashedStakeTotal`. Set `MESH_ENABLED=false` to fall back to the classic single-guardian escalating workflow.

To enable the standing retainer, set `MPP_ASSET`, `MPP_PAYOUT_ADDRESS`, and `MPP_AMOUNT_PER_PERIOD` in `apps/agent/.env`. Each settled period records whether it was actually **charged** on-chain or merely **accrued** (when no payer is configured) — provenance is never faked.

The mesh is also surfaced **visually** in the operator dashboard (`/dashboard`): the **Sentinel mesh** panel renders the live watcher fleet and the most recent race (each proposal, the ranked winner, and any slashing), the **Workflow objects** panel lists the registered KeeperHub workflow objects with honest `keeperhub` vs `local` provenance badges, and the **KeeperHub MCP tools** panel shows exactly which tools were discovered over MCP. All three refresh on an interval and on live `MESH_RACE` SSE events.

---

## ✅ Live end-to-end proof

Two real KeeperHub Direct Execution transactions are already on-chain and verifiable (see the **Verified On-Chain Proof** section at the top). The proof runner generates further artifacts on demand:

```bash
cd apps/agent
npm run proof
```

This drives the **entire real path** against live infrastructure and writes a machine-checkable artifact to `apps/agent/proofs/<timestamp>.json`:

1. **MCP handshake** — `initialize` + `tools/list` against the live KeeperHub MCP endpoint. Records the exact tool names the live server exposes. *(Note: `tools/call` is not yet exercised by this runner — that gap is tracked as P0.3.)*
2. **Workflow object** — ensures/creates the defense workflow object; records `source: "keeperhub"` (remote) or `"local"` honestly — never fakes a remote id.
3. **Live read** — reads the monitored position's on-chain health factor.
4. **Real execution** — simulates + executes one defense step through KeeperHub Direct Execution and captures the real `transactionHash` + explorer link. This is the path proven by the two tx hashes above.
5. **Receipt anchor** — fetches the on-chain receipt (block number, status) so the proof is block-anchored, not self-asserted.

The artifact contains the tx hash, block, and explorer link but **never** the API key or any private key — safe to commit. See [`apps/agent/PROOFS.md`](apps/agent/PROOFS.md) for details.

### Verifying an existing attestation

Attestation `inc_1785726412321` (block 44979064) is already on disk at `apps/agent/data/attestations/inc_1785726412321.json`. Verify it without running the agent:

```bash
# Via the running agent
curl http://localhost:4000/api/attestation/inc_1785726412321/verify

# Offline — no server trust required
npm run cli -- verify apps/agent/data/attestations/inc_1785726412321.json
```

The response confirms the keccak256 digest matches and the ECDSA signer equals `verifier_pubkey` (`0xe4cf2346C94d6Eb91d14FD4Ac63f85Fd3717c69c`).

---



