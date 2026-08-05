# Olutoju — Demo Runbook (Reproducible Recording Procedure)

> **Status:** Reconstructed from the committed evidence artifacts (`apps/agent/data/_dryrun.js`
> and `apps/agent/data/DEMO-DRYRUN-RECORD.md`). The numeric budgets, flake codes, and the
> canonical chaos request below are copied from those sources; anything that drifted from the
> originally-finalized runbook should be corrected in place — this file, not chat, is now the
> source of truth.
>
> **What this file is.** The *procedure* for producing a reproducible demo take: preconditions,
> the exact chaos request, the timing budget, the flake codes that gate whether recording is
> allowed, the fallback decision rule, and the on-camera script. It is deliberately separate from
> `apps/agent/data/DEMO-DRYRUN-RECORD.md`, which is the *result* of running this procedure on
> 2026-08-05. A future dry run (e.g. after the mesh F2 timing fix) re-runs against **this** file.

---

## Section 0 — Ground rules

1. **The recording gate is real.** You do not record until a silent, timed dry run passes the
   flake-code check in §2. A lucky single run is not a pass; the canonical dry run is **3 runs
   back-to-back**.
2. **Copy must match implementation** (§0 rule 9). Nothing is narrated on camera that the live
   system does not actually show in that take. If a capability isn't visible in the dry run, it is
   not in the script — see the mesh and private-route carve-outs below.
3. **No hardcoded slop.** Every hash, block number, and address shown on camera is read live from
   the running agent / BaseScan, never pasted from memory.
4. **Fallback is pre-decided, not improvised.** The C3 rule (§2) tells you which take to record
   *before* you see the dry-run result, so a bad mesh run doesn't turn into on-the-day narrative
   invention.

---

## Section 1 — Preconditions (verify before any dry run)

- [ ] Agent running on the current defensible vault. Dry-run of record used
      `0x7005A44a8d981C8070584201F2a68dD7A8f4e21c` — a vault where `partialUnwind()` is genuinely
      executable on-chain (verified functionally, not just by ABI: it reverts with its own guard
      `"position already safe"` at HF=150, proving the selector `0x00c7246b` exists).
- [ ] `KEEPERHUB_API_KEY` is a real org-scoped `kh_` key; defensive txs route through KeeperHub
      Direct Execution (the org Turnkey wallet signs, **not** the treasury `0xe4cf…c69c`).
- [ ] RPC reachable (`https://sepolia.base.org`), chain `84532`.
- [ ] Dashboard up at `http://localhost:3000/dashboard`; agent API at `http://localhost:4000`.
- [ ] Monitored position reads healthy (HF ≈ 1.50) at rest.
- [ ] `blockPrimaryDefense` is **reset to false** before the run (a known dry-run gotcha: it is not
      auto-reset between runs — see F2 root cause).

---

## Section 2 — Flake codes & the recording gate

Run the silent timed dry run (§3). Determine each code per run. **F1–F6 are flakes; hitting one
means do not record that configuration.** Some conditions are explicitly *not* flakes (§2.1).

| Code | Meaning | Fail condition |
|------|---------|----------------|
| **F1** | No defense hash | No incident with a real `txHash` appears within **90s** of the chaos send. |
| **F2** | Mesh produced no usable winner | The race returns **NONE** (all watchers slashed) instead of a winning proposal. |
| **F3** | Worker pool didn't boot | Fewer than the 3 independent workers (raw-node, mcp, langchain) come up. |
| **F4** | Wrong structural outcome | HF didn't drop, or the agent didn't enter defense, or no real escalated defense confirmed on-chain. |
| **F5** | Incident not visible | A new incident isn't created and surfaced through the dashboard's own `/api/incidents` proxy. |
| **F6** | Infra error | Any 5xx / 401 / 429 from KeeperHub, or no real hash returned. |

### 2.1 Not-a-flake (note verbally, do not fail on)

- **`privateRouteWon` = `n/a`/absent.** Private-route evidence is best-effort; if the competitor
  hash is dropped by the timing race before the evidence builder sees it, this is **not** a flake.
  **Consequence:** do not narrate private-route evidence on camera (the on-camera private-route
  line is conditional on it being visibly `true`).

### 2.2 The C3 fallback rule (decide the take *before* recording)

- **F2 hit (mesh no-winner) ⇒ record the GUARDIAN-PRIMARY take.** Do not promise or narrate the
  Sentinel Mesh race. The guardian escalation path (forced primary failure → real escalation to a
  working fallback → confirmed on-chain) is the pitch.
- **Mesh returns a winner on every take ⇒ mesh may appear** (as the race story or optional B-roll).
- The mesh F2 timing fix is **deliberately not attempted on recording day** — it needs its own
  separate clean dry run (§9) first.

---

## Section 3 — Canonical chaos request

Exactly one request drives the demo. Do not vary it between takes:

```
POST http://localhost:4000/api/chaos-mode/trigger
Content-Type: application/json

{ "forcePrimaryFailure": true, "injectPublicCompetitor": true }
```

curl form:

```bash
curl -s -X POST http://localhost:4000/api/chaos-mode/trigger \
  -H "Content-Type: application/json" \
  -d '{"forcePrimaryFailure": true, "injectPublicCompetitor": true}'
```

Expected 200 body shows `success:true`, `forcePrimaryFailure:true`, and a `publicCompetitorTxHash`
(may be dropped downstream by the timing race — see §2.1).

---

## Section 4 — Timing budget

| Budget | Value | Meaning |
|--------|-------|---------|
| **Chaos ack** | ~7–12s | `POST /api/chaos-mode/trigger` returns 200 (it awaits chaos-tx confirmations). |
| **Defense hash (target)** | ≤ **45s** | Green: incident with a real defense `txHash` appears well inside budget. |
| **Defense hash (hard gate)** | ≤ **90s** | Beyond 90s with no defense hash ⇒ **F1**. This is the dry-run poll window. |
| **Full take ceiling** | ≤ **180s** | The whole on-camera sequence (chaos → defense → BaseScan) stays under 3 minutes; talking track ≤ 90s. |
| **Cooldown between runs** | 15s | Rate-limit re-arm + primary-defense re-arm between the 3 dry-run runs. |

Reference elapsed from the dry-run of record (chaos-send → defense hash): ~13s / ~18s / ~20s — all
comfortably inside the 45s target.

---

## Section 5 — The silent timed dry run (how to run it)

The dry run is scripted and non-interactive: `apps/agent/data/_dryrun.js`. It executes the
canonical chaos request 3 times back-to-back (15s cooldown between), and for each run records:

1. Chaos HTTP status + elapsed, and whether `success`/`forcePrimaryFailure`/competitor hash came
   back.
2. Polls `GET /api/incidents` every 2s for up to **90s** for a NEW incident with a real `txHash`
   (F1 if none).
3. `GET /api/mesh` → winner or NONE + slashed stake total (F2 signal).
4. Whether the action escalated to `partialUnwind`.
5. `privateRouteWon` from `GET /api/attestation/:id` (note-only, §2.1).
6. On-chain receipt check: `from` address (must be the KeeperHub exec wallet) + `status`.

Run it, read the SUMMARY block, then apply §2 + §2.2. Do not record until the gate is satisfied.

---

## Section 6 — On-camera script (guardian-primary take)

> This is the take recorded when F2 is hit (the common case per the dry-run of record). If a clean
> mesh dry run is ever achieved, a mesh variant of this script is a separate procedure.

1. Show the dashboard with a healthy monitored position (HF 1.50).
2. Run the chaos curl (§3) — show HTTP 200 with `success:true`, `forcePrimaryFailure:true` on
   screen.
3. **Point at the workflow escalation path (NOT the mesh race panel):** primary defense
   `topUpCollateral` is blocked and fails simulation, so the guardian escalates to `partialUnwind`,
   which passes simulation and executes. This is the reliability story — forced primary failure,
   real escalation to a working fallback.
4. Point at the new incident and its defense `txHash` (`fallbackUsed: true`,
   `actionTaken: Partial Unwind … via KeeperHub`, `outcome: success`).
5. Open the defense tx on BaseScan — `Status: Success`, `from` = KeeperHub execution wallet; note
   the vault's own event is emitted **inside** the executor tx (the executor/router calls the
   vault; the vault runs `partialUnwind` and emits its event within that same tx).
6. **DROP the private-route line entirely** unless `privateRouteWon` is visibly `true` this take
   (§2.1) — in the dry-run of record it was `n/a`, so it was not narrated.
7. **Do NOT mention** the Sentinel Mesh race, marketplace listing, policy-deny, or Judge Mode —
   none are proven in a guardian-primary take. Keep the talking track ≤ 90s.

Framing note: "forced primary failure → real escalation to a working fallback → confirmed
on-chain" stands on its own as a strong reliability story; it does not need the mesh race.

---

## Section 7 — Policy-deny step (conditional; not part of the standard take)

A `DENIED_POLICY_*` outcome would only be narrated if a deliberate policy-deny step is exercised
and produces a real, visible denial on camera. **This condition has never been met** (no policy
interlock is built — see the scope lock in `README.md` roadmap). Do not add it to the script.

---

## Section 8 — Dry-run close-out checklist (verify, don't assume)

Both items must PASS before the recording gate is considered passed:

- [ ] **Dashboard loaded with panels, wired to LIVE agent data.**
      `http://localhost:3000/dashboard` serves the Olutoju app (branding present) with all panel
      markers (Incident, Health, Mesh, Workflow, position). Crucially, the dashboard's **own** proxy
      `GET :3000/api/incidents` returns exactly the incidents from this run (real
      `txHash`/`blockNumber`, `outcome:success`) — panels backed by live data, not the agent API in
      isolation. (No F5.)
- [ ] **Each defense tx independently confirmed `Status: Success` on-chain**, with `from` = the
      KeeperHub execution wallet (`0x6331…091E99`), **not** the treasury (`0xe4cf…c69c`). The `to`
      being a KeeperHub executor/router contract (`0x5aF5194B…f07D`) is expected, not a bug: trace
      the tx and confirm (a) calldata embeds the vault address, (b) inner selector `0x00c7246b` =
      `partialUnwind()`, (c) the tx's event log is emitted by the vault. This is the documented
      Direct-Execution model, verified by receipt status + event-emitter, not just a logged hash.

---

## Section 9 — What "good enough" is NOT

- **Not** a single lucky run. The gate is 3 back-to-back runs with the flake check applied.
- **Not** narrating a capability that isn't visible in the recorded take (mesh race when F2 hit;
  private-route evidence when `privateRouteWon` is `n/a`). Copy must match what's on screen.
- **Not** fixing the mesh F2 timing race on recording day. The fix (re-arm `blockPrimaryDefense`
  between runs; ensure `pendingChaos.set(...forcedPrimaryFailure)` runs before the poll can enter
  `defendPosition`; keep the competitor hash alive for the evidence builder) is deliberately
  deferred to a **separate** clean dry run, post-fix — never mixed into a recording session.
- **Not** a hash pasted from memory or a screenshot standing in for a live BaseScan lookup.
- **Not** claiming an on-chain state change from a hash alone — confirm receipt `status=1` **and**
  the vault event-emitter (§8).

---

## Related artifacts

- `apps/agent/data/DEMO-DRYRUN-RECORD.md` — the recorded result of running this procedure on
  2026-08-05 (guardian-primary decision, 3-run evidence, BaseScan links, the rewritten on-camera
  script for that take).
- `apps/agent/data/_dryrun.js` — the silent timed dry-run harness (§5).
- `apps/agent/proofs/proof-1785793973564.json` — the reproducible execution proof artifact.
- `apps/agent/PROOFS.md` — how the proof runner works and how anyone verifies it.
