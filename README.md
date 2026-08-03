# Olutoju (The Guardian) 🛡️

**Olutoju** (meaning "The Guardian" or "Caretaker" in Yoruba) is an autonomous, cryptographically secure DeFi position monitoring and defense system. It continuously watches the health of on-chain collateralized debt positions (CDPs) and uses **KeeperHub** for direct, private-mempool execution of defensive transactions when health factors degrade below critical thresholds. 

The system features real-time monitoring, cryptographic incident attestations, and a gorgeous live dashboard for operators to oversee the autonomous agent's activity.

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
- **Live Telemetry**: A Next.js dashboard streaming live metrics via SSE — now including `WORKFLOW_STEP`, `INCIDENT_REPORT`, and `SETTLEMENT_UPDATE` events.


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


## 🤝 Contributing
Contributions, issues, and feature requests are welcome. Feel free to check the issues page if you want to contribute.

## 📄 License
MIT License.
