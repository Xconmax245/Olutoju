# Onboarding — Zero to Verified Proof

> **Goal of this doc:** get a reviewer from a fresh clone to a **live,
> block-anchored proof of KeeperHub Direct Execution** in one command, then hand
> them the exact links to verify everything independently on BaseScan — no trust
> in this repo required.

Olutoju ("The Guardian") is an autonomous DeFi position-defense agent. It watches
on-chain health factors and, when a position degrades, routes an **escalating
defense workflow** (`topUpCollateral → partialUnwind → pausePosition`) through
**KeeperHub Direct Execution** — the agent never signs defensive transactions
itself. Every successful defense emits a cryptographically signed incident report.

---

## 1. Zero → `npm run proof`

The single command that proves the whole execution rail is live:

```bash
# from a fresh clone
npm install                     # installs all workspaces (root)

cd apps/agent
cp .env.example .env            # then fill in the four required values below
npm run proof                   # drives the real path, writes a proof artifact
```

### Required `.env` values

| Var | What it is | Example |
| --- | --- | --- |
| `KEEPERHUB_API_KEY` | **Organization-scoped** key (`kh_` prefix). User-scoped `wfb_` keys are rejected. Create at app.keeperhub.com → Settings → API Keys → **Organisation** tab. | `kh_...` |
| `RPC_URL` | RPC for the target chain (Base Sepolia by default). | `https://sepolia.base.org` |
| `VAULT_ADDRESS` | A deployed, defensible position to act on. | `0x6f3A57f763e54dAED307433E86fa1AfE840c3f09` |
| `CHAIN_ID` | Chain id (Base Sepolia). | `84532` |

`npm run proof` exits `0` and prints `LIVE EXECUTION PROVEN ✅` **only** when a
real `transactionHash` came back from KeeperHub. It writes
`apps/agent/proofs/proof-<timestamp>.json`. The artifact **never** contains the
API key or any private key — only the non-secret key prefix — so it is safe to
commit and publish.

> Want the full agent + dashboard instead of just the proof runner?
> `npm run dev:agent` (agent on `:4000`) and `npm run dev:web` (dashboard on
> `:3000`) from the repo root.

---

## 2. Friction table — what can trip you up, and the fix

| Symptom | Cause | Fix |
| --- | --- | --- |
| `A valid organization-scoped KeeperHub API key (kh_...) is required` | You used a user-scoped `wfb_` key. | Generate a key from the **Organisation** tab, not the user tab. |
| `[FATAL] TREASURY_PRIVATE_KEY is not set` | Agent refuses to start without a signing key for attestations/chaos. | Set a **fresh, dedicated** key. It never signs defensive txs (those go through KeeperHub). |
| `[FATAL] VAULT_ADDRESS (or POSITIONS) is not set` | Nothing to monitor. | Point `VAULT_ADDRESS` at a deployed vault (or set `POSITIONS`). |
| `execution.outcome: "exhausted"` + non-zero exit | The vault isn't defensible in its current state. | Pick a position whose health factor can actually be restored; `notes[]` explains why. |
| `workflow.source: "local"` | The live MCP `create_workflow` tool name didn't match discovery. | Not an error — provenance is honest. Override with `KEEPERHUB_CREATE_WORKFLOW_TOOL=create_workflow` if your org differs. |
| `Chain 84532 is not enabled on this KeeperHub org` | The target chain isn't enabled for your org. | Enable Base Sepolia in KeeperHub, or point at a chain your org has enabled. |
| MCP `tools/list` unavailable at startup | Network/endpoint issue reaching `https://app.keeperhub.com/mcp`. | Confirm connectivity; override with `KEEPERHUB_MCP_URL` if needed. |

---

## 3. Existing published proof (verify it yourself)

You don't have to run anything to check the claim — a reproducible artifact is
already committed:

**Artifact:** [`apps/agent/proofs/proof-1785793973564.json`](apps/agent/proofs/proof-1785793973564.json)
(generated 2026-08-03, Base Sepolia / chain `84532`).

**Vault (MockVault):** [`0x6f3A57f763e54dAED307433E86fa1AfE840c3f09`](https://sepolia.basescan.org/address/0x6f3A57f763e54dAED307433E86fa1AfE840c3f09)

| Rail | On-chain evidence |
| --- | --- |
| **KeeperHub Direct Execution** (`topUpCollateral`, gas-sponsored, receiptStatus `1`, block `45012839`) | [`0x33d5…d184`](https://sepolia.basescan.org/tx/0x33d55b6533d1b34a3d276fe08a032078f84964aa99a28f371cc1f3b3e1f1d184) |
| **x402 outcome-gated bounty settlement** | [`0x488d…4b5d`](https://sepolia.basescan.org/tx/0x488da2a4b2128e3be606e81ede462d102688b43e8346dfb58e82717936b74b5d) |
| **MPP standing-retainer settlement** | [`0xfe31…adfb`](https://sepolia.basescan.org/tx/0xfe311dee7f379ee779c01331e2669909f37e8246a927867546bd154b7f07adfb) |
| **KeeperHub Workflow object** (real, `source: "keeperhub"`) | `workflowId: vfgnrtrjqv3j8jryv18yd` · slug `sentinel-defense-84532-6f3a57f7` |
| **MCP tool discovery** | 35 live tools including `execute_contract_call`, `create_workflow` |

### How to verify in 3 steps
1. Open the artifact and copy `execution.txHash`.
2. Look it up on [BaseScan](https://sepolia.basescan.org). Confirm it is a real,
   confirmed transaction **to** the vault with `receiptStatus: 1`, and that
   `execution.blockNumber` matches the explorer's block.
3. (Optional) Re-run `npm run proof` with your own `kh_` key — you'll get a fresh
   artifact with a fresh hash, proving the path is live, not canned.

Because the hash is **on-chain**, the block explorer — not this repo — is the
source of truth. See [`apps/agent/PROOFS.md`](apps/agent/PROOFS.md) for the full
proof-runner contract.

### Verify a decision (off-chain, signature)
Every real defense also writes a signed incident report you can verify offline:

```bash
cd apps/agent
npm run cli -- verify data/attestations/<incidentId>.json
# or over HTTP while the agent runs:
curl http://localhost:4000/api/attestation/<incidentId>/verify
```

Two independent, non-repudiable proofs: the **transaction** (on-chain, via the
explorer) and the **decision** (off-chain, via the ECDSA signature).

---

## 4. Bounty framing — what this submission claims

This project is submitted for the **KeeperHub** bounty. The scoring-relevant,
independently verifiable claims:

- ✅ **KeeperHub Direct Execution** — defensive transactions are broadcast
  through KeeperHub's engine; the org's Turnkey-backed wallet is the `From`
  address, not the agent treasury. Proven by tx `0x33d5…d184`.
- ✅ **KeeperHub MCP `tools/list` + `tools/call`** — the agent performs a real
  `initialize → tools/list` handshake against `https://app.keeperhub.com/mcp`
  and makes live `execute_contract_call` round-trips (35 tools discovered).
- ✅ **KeeperHub Workflow Builder** — the escalating defense is registered as a
  **real** KeeperHub workflow object (`source: "keeperhub"`,
  `workflowId: vfgnrtrjqv3j8jryv18yd`), surfaced per-incident via the new
  `keeperhubWorkflowId` field on each incident.
- ✅ **Gas Sponsorship (§1.8)** — executions carry `sponsorGas: true`, so a
  watcher with an empty wallet can still defend (org paymaster covers fees).
- ✅ **x402 + MPP settlement rails** — outcome-gated bounty and standing-retainer
  payments settle on-chain (txs `0x488d…4b5d`, `0xfe31…adfb`).

Everything above is reproducible with `npm run proof` and checkable on BaseScan;
nothing here is a screenshot or a copy-pasted string.
