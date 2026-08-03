# Sentinel Mesh — Implementation Map (Path to "Utmost Completion")

> **Purpose of this document.** This is the authoritative, file-level checklist of everything
> that still needs *proper, non-fake, production-grade* wiring to take the project from its
> current state (a single working guardian with a real KeeperHub Direct Execution client) to
> the full **Sentinel Mesh** vision — an economic race network of watcher agents that can only
> exist because KeeperHub exists.
>
> Scoring lens: hackathon judging criteria (KeeperHub surface coverage, originality, demo
> reliability, DX) **+** the ambitious multi-agent + economic-primitive vision.

---

## 0. Current Honest Baseline (what is REAL today)

| Area | File | State |
|------|------|-------|
| KeeperHub Direct Execution client | `apps/agent/src/keeperhub.ts` | ✅ **REAL** — `GET /api/chains` validation, simulate-first, `Idempotency-Key`, status polling, real BaseScan tx link. Does **not** self-sign defensive txs. |
| Agent detection + decision loop | `apps/agent/src/index.ts` | ✅ Real polling of on-chain `healthFactor()`, simulate→execute→attest, fail-loud startup, chaos rate-limit + optional secret. |
| Signed attestation (basic) | `apps/agent/src/index.ts` (`Attestation`) | ✅ ECDSA-signed payload persisted to `data/attestations/*.json`. |
| Chaos trigger (demo) | `apps/agent/src/index.ts` `/api/chaos-mode/trigger` | ✅ Real on-chain `triggerChaos()` via treasury wallet (demo-only signer). |
| Contract | `apps/contracts/contracts/MockVault.sol` | ✅ Deployed & live on Base Sepolia (84532), `0x6f3A57f763e54dAED307433E86fa1AfE840c3f09`. |
| Web dashboard | `apps/web/**` | ⚠️ Landing + dashboard shell exist; consumes agent API. Not yet showing race/x402/private-route. |

**Everything below the Direct Execution client is still single-guardian territory.** The economic
race layer, x402 outcome-gating, workflow-builder usage, and audit-as-product are the pieces that
turn "an agent that calls KeeperHub" into "an economic network that can only exist because
KeeperHub exists."

---

## 1. KeeperHub Surface Coverage

Only **Direct Execution** is wired. Each remaining surface below must be *load-bearing* in the demo.

| # | Surface | Current | Required Wiring | New/Touched Files |
|---|---------|---------|-----------------|-------------------|
| 1.1 | Direct Execution API | ✅ done | **Harden:** full error taxonomy, exp-backoff retry on 429, spending-cap detection, chain-enablement pre-check (already partially via `/api/chains`). Every defensive action goes through the safe sequence, no exceptions. | `apps/agent/src/keeperhub.ts` |
| 1.2 | **MCP Server** | ❌ none | Discover tools via `https://app.keeperhub.com/mcp` (or per-workflow `/mcp/w/<slug>`). Use MCP to list/create/validate/execute workflows, read audit logs, call marketplace tools. At least **one watcher speaks pure MCP**. | `apps/agent/src/keeperhub-mcp.ts` (new), `apps/watchers/mcp-watcher/**` (new) |
| 1.3 | **Workflow Builder** | ❌ none | Multi-step defensive sequences (simulate → top-up → partial unwind → pause → notify) live as **real KeeperHub workflows**, not hardcoded `contract-call`s. Agent creates/updates via MCP/API OR calls pre-built listed workflows. | `apps/agent/src/workflows/defense-workflow.ts` (new), `workflows/*.json` (new definitions) |
| 1.4 | **x402** (pay-per-successful-defense) | ❌ none | After a defensive tx lands + audit confirms success, protected protocol / demo insurance pool pays the winning watcher via x402. Agentic wallet handling of 402 challenges. **Payment gated on on-chain outcome, not the claim.** | `apps/agent/src/x402.ts` (new), `apps/contracts/contracts/InsurancePool.sol` (new) |
| 1.5 | **MPP** (standing retainer) | ❌ none | Protocol pays recurring "protection retainer" via MPP. Show **dual-protocol auto-routing** (x402 for incident bounties, MPP for retainers) in the same system. | `apps/agent/src/mpp.ts` (new) |
| 1.6 | **Audit Trail as Product** | ⚠️ partial | Every success → structured, public, exportable incident report built from KeeperHub audit fields (trigger, sim result, submitted tx, gas used, outcome, timestamp), signed/attested. | `apps/agent/src/incident-report.ts` (new), extend `Attestation` in `index.ts` |
| 1.7 | Private Routing / MEV protection | ⚠️ assumed | During chaos, submit a competing **public-mempool** tx and prove the KeeperHub-routed defense lands while the public one is delayed/reordered. Surface in incident report. | `apps/agent/src/chaos/public-competitor.ts` (new) |
| 1.8 | Gas Sponsorship | ❌ none | Allow a watcher with an **empty wallet** to still execute via KeeperHub gas sponsorship. Name-check + optionally trigger. | `apps/agent/src/keeperhub.ts` (sponsorship flag) |
| 1.9 | CLI | ❌ none | `kh`-style CLI / scripts for ops, forced triggers, status inspection, demo reproducibility. | `apps/cli/**` (new) or `scripts/*.ts` |

---

## 2. Multi-Agent / Race Layer  *(core of Sentinel Mesh — currently ZERO)*

Current code is a single guardian. Mesh-level ambition needs:

- [ ] **2.1** 2–4 independent watcher agents, ideally different frameworks (one pure **MCP**, one **LangChain/CrewAI** wrapper, one **raw Node**).
- [ ] **2.2** Shared detection of the same anomaly (common event bus / poll).
- [ ] **2.3** Each watcher independently proposes a defensive tx (**simulation-first**).
- [ ] **2.4** A **race / consensus layer** (ideally inside a KeeperHub workflow) selecting the first valid, simulation-passing proposal.
- [ ] **2.5** Only the **winner** may execute + claim the bounty.
- [ ] **2.6** Losers can have **stake slashed** (see §3).

**Files:** `apps/watchers/` (new workspace) with `mcp-watcher/`, `langchain-watcher/`, `node-watcher/`; `apps/agent/src/mesh/race-coordinator.ts` (new); shared `packages/mesh-protocol/` (new — proposal schema, message types).

> Without this, the project is still "VaultSentinel", not "Sentinel Mesh".

---

## 3. Economic Primitive  *(highest originality lever — currently MISSING)*

- [ ] **3.1 Outcome-conditioned x402 payment** — released only after KeeperHub audit confirms the tx landed AND final state matches the claimed action.
- [ ] **3.2 Watcher stake** — watchers post small stake (test USDC). Winner takes bounty + a portion of losers' stakes. Failed sims / low-quality proposals lose stake.
- [ ] **3.3 Adaptive bounty** — bounty scales with severity / current gas conditions.
- [ ] **3.4 Standing MPP retainer** from the protected protocol.
- [ ] **3.5 Verifiable Defense Attestation** — publish cryptographic attestation (hash of trigger + simulation + tx hash + final state) derived from the audit trail; independently verifiable by other agents/protocols.

**Files:** `apps/contracts/contracts/StakeManager.sol` (new), `apps/contracts/contracts/BountyEscrow.sol` (new), `apps/agent/src/economics/{stake,bounty,settlement}.ts` (new). Extend existing `Attestation` (already in `index.ts`) into a public, verifiable registry.

---

## 4. Detection & Position Layer

Current: only `MockVault.healthFactor()`.

- [ ] **4.1** At least one **real protocol adapter** — Aave V3 / Morpho / Compound V3 health factor / liquidation threshold (via KeeperHub plugins or direct reads).
- [ ] **4.2** Multiple **threat types**: health-factor drop, oracle deviation, large withdrawal / liquidity drain, sandwich-setup signals.
- [ ] **4.3** **Event-driven triggers** (KeeperHub Blockchain Event trigger) in addition to polling.
- [ ] **4.4** Clean separation: **detection is framework-agnostic; only execution goes through KeeperHub.**

**Files:** `apps/agent/src/adapters/{aave,morpho,compound}.ts` (new), `apps/agent/src/detection/{threats,triggers}.ts` (new). Refactor current inline polling in `index.ts` → `detection/` module.

---

## 5. Chaos / Failure-Mode Showcase  *(demo reliability)*

Must be deterministic and spectacular. One-click (or API) chaos that:

- [ ] **5.1** Drops health factor (or injects oracle move / large withdrawal).
- [ ] **5.2** Injects an artificial **gas spike** if possible.
- [ ] **5.3** Submits a competing **public-mempool** transaction.
- [ ] **5.4** Forces **at least one simulation failure** so the system must re-plan.
- [ ] **5.5** System still produces a successful defense + clean incident report under these conditions.
- [ ] **5.6** Live log view: all watchers detecting → racing → winner executing via private route.

**Files:** extend `apps/agent/src/index.ts` `/api/chaos-mode/trigger`; new `apps/agent/src/chaos/orchestrator.ts`; `MockVault.sol` may need an oracle-deviation / withdrawal hook or a second mock (`apps/contracts/contracts/MockOracle.sol`).

---

## 6. Observability, Dashboard & Incident Report

- [ ] **6.1** Expand the existing `EventEmitter` SSE stream (`/api/stream`) with race + payment events.
- [ ] **6.2** Web dashboard (`apps/web`) shows: live health factors, **active race**, simulation results, **private-route vs public tx** comparison, **x402 settlement**, full incident report.
- [ ] **6.3** Incident report auto-generated from KeeperHub audit data; exportable + publicly verifiable.

**Files:** `apps/web/src/app/dashboard/**`, new components `RaceView.tsx`, `PrivateRouteCompare.tsx`, `SettlementPanel.tsx`, `IncidentReport.tsx`; extend `apps/web/src/app/api/stream/route.ts` and `apps/web/src/lib/api.ts`.

---

## 7. Security & Trust Model Hardening

- [ ] **7.1** Defensive actions **never** execute without a passing simulation. *(done for primary path — enforce everywhere.)*
- [ ] **7.2** Watcher agents **never** hold protocol funds.
- [ ] **7.3** Treasury key used **only** for demo chaos signing + attestations, never for real defenses. *(currently true — keep invariant, document + assert.)*
- [ ] **7.4** Rate limits + secrets on chaos endpoint. *(started in `index.ts` — finalize.)*
- [ ] **7.5** Explicit handling of KeeperHub **429 / spending-cap / chain-disabled** errors. *(partial in `keeperhub.ts` — complete the taxonomy.)*
- [ ] **7.6** **No silent fallbacks** anywhere. *(fallback path in `index.ts` currently retries same call — make it a genuinely different strategy or make failure loud.)*

---

## 8. Developer Experience & Submission Readiness

- [ ] **8.1** High-quality `README.md`: exact one-liner, architecture diagram, 5-minute local demo, **real tx hash example**, how *every* KeeperHub surface is used.
- [ ] **8.2** Minimal reproducible starter / **Docker one-command demo**.
- [ ] **8.3** Clear mapping of every judging criterion → concrete repo artifact.
- [ ] **8.4** Optional: PR/template aimed at the **Best Onboarding UX** bounty.

**Files:** `README.md`, `docker-compose.yml` (new), `docs/architecture.md` (new), `docs/judging-map.md` (new).

---

## 9. Priority Order (max score impact)

### P0 — must have for a competitive submission
1. Real **multi-step defensive workflow** via KeeperHub Workflow Builder or MCP. *(§1.3 / §1.2)*
2. **Outcome-gated x402 payment** after confirmed success. *(§1.4 / §3.1)*
3. Full **audit-trail → structured incident report**. *(§1.6)*
4. **Deterministic chaos mode** visibly demonstrating private routing + retry under stress. *(§5)*
5. At least **one real protocol position** (or extremely convincing multi-threat mock). *(§4.1)*

### P1 — strong → top-tier
6. **Multi-watcher race** + stake/bounty. *(§2 / §3.2)*
7. **Verifiable Defense Attestation** registry. *(§3.5)*
8. **Dual-protocol** (x402 + MPP) visibility. *(§1.5 / §3.4)*
9. **MCP-native watcher**. *(§1.2 / §2.1)*

### P2 — polish & differentiation
10. **Gas sponsorship** path. *(§1.8)*
11. Beautiful dashboard + **live race visualization**. *(§6.2)*
12. **Cross-framework** proof. *(§2.1)*
13. Public **incident registry / replay**. *(§6.3)*

---

## 10. Suggested Build Sequence (dependency-aware)

```
Step 1  (§4 refactor)      Extract detection/ from index.ts; add 1 real adapter (Aave V3 read).
Step 2  (§1.6, §3.5)       Incident-report module + verifiable attestation registry.
Step 3  (§1.3/§1.2)        Define defense workflow in KeeperHub; call via API/MCP.
Step 4  (§1.4/§3.1)        InsurancePool.sol + x402 outcome-gated settlement.
Step 5  (§5)               Deterministic chaos orchestrator (gas spike + public competitor + forced sim-fail).
Step 6  (§2)               Stand up watchers/ workspace; race-coordinator; 2 frameworks minimum.
Step 7  (§3.2-3.4)         StakeManager + BountyEscrow + MPP retainer.
Step 8  (§6)               Dashboard race/settlement/private-route views over expanded SSE.
Step 9  (§1.5, §1.8, §1.9) MPP, gas sponsorship, CLI.
Step 10 (§8)               README, Docker one-command demo, judging map.
```

## 11. Definition of Done (acceptance for "utmost completion")

- [ ] Every KeeperHub surface in §1 is exercised by real code in a single demo run (screenshot/log per surface).
- [ ] ≥2 watchers (≥2 frameworks) detect the same anomaly, race, and exactly one wins + executes via KeeperHub.
- [ ] A real defensive tx lands via private routing while a public competitor is visibly delayed.
- [ ] x402 pays the winner **only after** audit confirms the on-chain outcome; a losing/failed proposal receives nothing (and is slashed).
- [ ] A public, cryptographically verifiable incident report + attestation is produced from KeeperHub audit data.
- [ ] `docker compose up` (or one documented command) reproduces the full demo end-to-end.
