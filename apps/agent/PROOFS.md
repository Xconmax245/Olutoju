# Live End-to-End Proof

> **Why this file exists.** A reviewer's fair criticism was: *"Live end-to-end
> proof (real `kh_` key + real tx hashes published) is not visible in the repo."*
> Hand-pasting a hash proves nothing (anyone can paste a string). So instead of
> claiming, this repo ships a **reproducible proof runner** that drives the
> entire real path against live infrastructure and emits a **machine-checkable,
> block-anchored artifact** you can independently verify on a block explorer.

## What the proof runner does

`apps/agent/src/proof/e2e-proof.ts` (run with `npm run proof` from `apps/agent`)
executes the full production path and writes
`apps/agent/proofs/proof-<timestamp>.json`:

| Step | Real action | Recorded in artifact |
| --- | --- | --- |
| 1. MCP handshake | `initialize` + `tools/list` against the live KeeperHub MCP endpoint | `keeperhub.mcpInitialized`, `keeperhub.toolsDiscovered[]` |
| 2. Workflow object | ensure/create the defense workflow object | `workflow.source` (`keeperhub` vs `local`), `workflow.workflowId`, `workflow.via` |
| 3. Live read | on-chain `healthFactor()` of the monitored vault | `read.healthFactor` |
| 4. Real execution | simulate **+** execute one defense step via KeeperHub Direct Execution | `execution.txHash`, `execution.transactionLink`, `execution.gasUsed` |
| 5. Receipt anchor | fetch the on-chain receipt for the returned hash | `execution.blockNumber`, `execution.receiptStatus` |

The runner exits `0` only when a **real `transactionHash`** came back, printing
`LIVE EXECUTION PROVEN ✅`. The artifact **never** contains the API key or any
private key — only the non-secret key prefix (e.g. `kh_live_ab…`), so it is safe
to commit and publish.

## How to generate your own proof

```bash
cd apps/agent
cp .env.example .env          # then fill in the real values below
#   KEEPERHUB_API_KEY=kh_...   (organization-scoped)
#   RPC_URL=...                (Base Sepolia or your chain)
#   VAULT_ADDRESS=0x...        (a deployed, defensible position)
#   CHAIN_ID=84532
npm run proof
```

The command prints the JSON artifact and its path. Open the
`execution.transactionLink` (or paste `execution.txHash` into the explorer at
`BLOCKSCAN_URL`) to confirm the transaction landed on-chain.

## How anyone verifies a published proof

1. Open `apps/agent/proofs/proof-<timestamp>.json`.
2. Take `execution.txHash` and look it up on the block explorer for the chain in
   `chainId` / `network`. Confirm it is a real, confirmed transaction to
   `vaultAddress` with `receiptStatus: 1`.
3. Confirm `execution.blockNumber` matches the explorer's block for that hash.
4. Optionally re-run `npm run proof` yourself with your own `kh_` key — you'll
   get a fresh artifact with a fresh hash, proving the path is live, not canned.

Because the hash is **on-chain**, no trust in this repo or its authors is
required: the block explorer is the source of truth.

## Relationship to incident attestations

The proof runner exercises the *execution* rail. Separately, every real defense
the running agent performs writes a **signed incident report** to
`apps/agent/data/attestations/<incidentId>.json` (keccak256 digest + ECDSA
signature) that is independently verifiable offline:

```bash
npm run cli -- verify apps/agent/data/attestations/<incidentId>.json
# or over HTTP:
curl http://localhost:4000/api/attestation/<incidentId>/verify
```

Together these give two independent, non-repudiable proofs: the **transaction**
(on-chain, via the explorer) and the **decision** (off-chain, via the signature).

## Honesty notes

- If the live MCP `create-workflow` tool name doesn't match discovery, step 2
  records `source: "local"` — it does **not** silently claim a remote object.
- If the vault isn't defensible in its current state, `execution.outcome` is
  `exhausted` and `notes[]` explains why; the runner exits non-zero rather than
  fabricating success.
- `proofs/` artifacts are the *only* place hashes are published, and each is
  reproducible — nothing here is a screenshot or a copy-pasted claim.
