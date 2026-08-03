/**
 * KeeperHub Direct Execution client.
 *
 * REAL integration against KeeperHub's public Direct Execution API
 * (https://app.keeperhub.com/api/execute/...). Defensive transactions are
 * routed THROUGH KeeperHub — the organization's Turnkey-backed wallet signs and
 * KeeperHub's engine handles private routing + gas. The agent does NOT sign or
 * broadcast these transactions itself.
 *
 * Auth: organization-scoped `kh_` API key via `Authorization: Bearer`.
 * Safe sequence (per official docs):
 *   1. simulate: true  → proceed only if success && !wouldRevert
 *   2. broadcast with a unique Idempotency-Key
 *   3. poll /status for the authoritative transactionHash
 */

import { randomUUID } from "crypto";

const KEEPERHUB_BASE_URL =
  process.env.KEEPERHUB_BASE_URL || "https://app.keeperhub.com/api";

export interface SimulationResult {
  ok: boolean;
  wouldRevert: boolean;
  reason?: string;
  raw?: any;
}

export interface ExecutionResult {
  executionId: string;
  status: "completed" | "failed" | "pending" | string;
  transactionHash?: string;
  transactionLink?: string;
  gasUsed?: string;
  blockNumber?: number;
  raw?: any;
}

export class KeeperHubError extends Error {
  status?: number;
  body?: any;
  constructor(message: string, status?: number, body?: any) {
    super(message);
    this.name = "KeeperHubError";
    this.status = status;
    this.body = body;
  }
}

export class KeeperHubClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = KEEPERHUB_BASE_URL) {
    if (!apiKey || !apiKey.startsWith("kh_")) {
      throw new KeeperHubError(
        "A valid organization-scoped KeeperHub API key (kh_...) is required. User-scoped wfb_ keys are rejected."
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...extra,
    };
  }

  private async request(path: string, init: RequestInit): Promise<{ res: Response; json: any }> {
    const res = await fetch(`${this.baseUrl}${path}`, init);
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { res, json };
  }

  /**
   * Confirm the target chain is enabled on this KeeperHub org before executing.
   * Returns the enabled chains list for tooling that needs it.
   */
  async listEnabledChains(): Promise<{ chainId: number; name?: string }[]> {
    const { res, json } = await this.request("/chains", { method: "GET", headers: this.headers() });
    if (!res.ok) {
      throw new KeeperHubError(`Failed to fetch /api/chains (${res.status})`, res.status, json);
    }
    const chains: any[] = Array.isArray(json) ? json : json?.chains || [];
    return chains
      .filter((c) => c.isEnabled !== false)
      .map((c) => ({ chainId: Number(c.chainId ?? c.id), name: c.name }));
  }

  /** Confirm the target chain is enabled on this KeeperHub org before executing. */
  async assertChainEnabled(chainId: number): Promise<void> {
    const { res, json } = await this.request("/chains", { method: "GET", headers: this.headers() });
    if (!res.ok) {
      throw new KeeperHubError(`Failed to fetch /api/chains (${res.status})`, res.status, json);
    }
    const chains: any[] = Array.isArray(json) ? json : json?.chains || [];
    const match = chains.find((c) => Number(c.chainId ?? c.id) === Number(chainId));

    if (!match) {
      throw new KeeperHubError(`Chain ${chainId} is not available on this KeeperHub org.`);
    }
    if (match.isEnabled === false) {
      throw new KeeperHubError(`Chain ${chainId} exists but is not enabled on this KeeperHub org.`);
    }
  }

  /**
   * Simulate a contract write (dry-run). Returns ok only when KeeperHub reports
   * success AND the call would not revert.
   */
  async simulateContractCall(params: ContractCallParams): Promise<SimulationResult> {
    const body = buildContractCallBody(params, true);
    const { res, json } = await this.request("/execute/contract-call", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return {
        ok: false,
        wouldRevert: true,
        reason: json?.error || json?.message || `Simulation HTTP ${res.status}`,
        raw: json,
      };
    }

    const wouldRevert = json?.wouldRevert === true;
    const success = json?.success !== false; // default true unless explicitly false
    return {
      ok: success && !wouldRevert,
      wouldRevert,
      reason: wouldRevert ? json?.revertReason || json?.reason || "would revert" : undefined,
      raw: json,
    };
  }

  /**
   * Broadcast a contract write through KeeperHub with idempotency, then poll for
   * the authoritative transaction hash.
   */
  async executeContractCall(params: ContractCallParams & { idempotencyKey?: string }): Promise<ExecutionResult> {
    const body = buildContractCallBody(params, false);
    const idempotencyKey = params.idempotencyKey || randomUUID();

    const { res, json } = await this.request("/execute/contract-call", {
      method: "POST",
      headers: this.headers({ "Idempotency-Key": idempotencyKey }),
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      throw new KeeperHubError(`Rate limited by KeeperHub. Retry-After: ${retryAfter}s`, 429, json);
    }
    if (res.status === 403) {
      throw new KeeperHubError(`KeeperHub rejected execution (403): ${json?.error || "spending cap or auth"}`, 403, json);
    }
    if (!res.ok) {
      throw new KeeperHubError(`KeeperHub execution failed (HTTP ${res.status})`, res.status, json);
    }

    const executionId: string | undefined = json?.executionId;
    if (!executionId) {
      throw new KeeperHubError("KeeperHub did not return an executionId.", res.status, json);
    }

    // If the API already reports a terminal state with a hash, short-circuit.
    if (json?.transactionHash) {
      return {
        executionId,
        status: json.status || "completed",
        transactionHash: json.transactionHash,
        transactionLink: json.transactionLink,
        gasUsed: json.gasUsed?.toString(),
        blockNumber: json.blockNumber,
        raw: json,
      };
    }

    return this.pollStatus(executionId);
  }

  /** Poll GET /api/execute/{id}/status until terminal, honoring poll-interval hints. */
  async pollStatus(executionId: string, maxAttempts = 30): Promise<ExecutionResult> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { res, json } = await this.request(`/execute/${executionId}/status`, {
        method: "GET",
        headers: this.headers(),
      });

      if (res.ok && json) {
        const status: string = json.status || "pending";
        const terminal = status === "completed" || status === "failed";
        if (terminal) {
          if (status === "failed") {
            throw new KeeperHubError(
              `KeeperHub execution ${executionId} failed: ${json.error || json.reason || "unknown"}`,
              res.status,
              json
            );
          }
          return {
            executionId,
            status,
            transactionHash: json.transactionHash,
            transactionLink: json.transactionLink,
            gasUsed: json.gasUsed?.toString(),
            blockNumber: json.blockNumber,
            raw: json,
          };
        }
      }

      const hintMs = Number(res.headers.get("X-Poll-Interval-Hint")) * 1000 || 2000;
      await new Promise((r) => setTimeout(r, hintMs));
    }
    throw new KeeperHubError(`Timed out polling KeeperHub status for ${executionId}.`);
  }

  /**
   * Best-effort REST workflow creation (§1.3 fallback). KeeperHub's primary
   * workflow-authoring surface is MCP; this is a secondary seam for orgs that
   * expose a REST route. We probe a small set of plausible paths and treat the
   * first 2xx as success. If none respond, we throw so the caller can fall back
   * to the honest local registry — we never fabricate a remote id.
   */
  async createWorkflowRest(payload: {
    name: string;
    slug: string;
    description: string;
    chainId: number;
    contractAddress: string;
    nodes: unknown[];
    edges: unknown[];
    [k: string]: unknown;
  }): Promise<{ workflowId?: string; slug?: string; via: string; verified: boolean }> {
    const candidatePaths = (
      process.env.KEEPERHUB_WORKFLOW_PATH || "/workflows,/workflow/create,/workflows/create"
    ).split(",").map((p) => p.trim()).filter(Boolean);

    let lastErr: string | undefined;
    for (const p of candidatePaths) {
      try {
        const { res, json } = await this.request(p, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const workflowId = json?.workflowId ?? json?.id ?? json?.data?.id;
          const slug = json?.slug ?? json?.data?.slug ?? payload.slug;
          return {
            workflowId: workflowId ? String(workflowId) : undefined,
            slug: slug ? String(slug) : undefined,
            via: `rest:${p}`,
            verified: false,
          };
        }
        // 404/405 -> this path isn't the one; keep probing. Other codes are notable.
        if (res.status !== 404 && res.status !== 405) {
          lastErr = `HTTP ${res.status} at ${p}: ${json?.error || json?.message || "unknown"}`;
        }
      } catch (err: any) {
        lastErr = err?.message;
      }
    }
    throw new KeeperHubError(lastErr || "No REST workflow endpoint responded.");
  }

  /** Best-effort REST workflow listing (companion to createWorkflowRest). */
  async listWorkflowsRest(): Promise<any[]> {
    const candidatePaths = (
      process.env.KEEPERHUB_WORKFLOW_LIST_PATH || "/workflows,/workflow/list"
    ).split(",").map((p) => p.trim()).filter(Boolean);

    for (const p of candidatePaths) {
      try {
        const { res, json } = await this.request(p, { method: "GET", headers: this.headers() });
        if (res.ok) {
          return Array.isArray(json) ? json : json?.workflows ?? [];
        }
      } catch {
        /* keep probing */
      }
    }
    throw new KeeperHubError("No REST workflow-list endpoint responded.");
  }
}

export interface ContractCallParams {
  contractAddress: string;
  chainId: number;
  functionName: string;
  functionArgs?: unknown[];
  abi?: unknown[];
  value?: string;
  gasLimitMultiplier?: string;
  /**
   * Gas Sponsorship (§1.8): when true, the org's paymaster/sponsorship covers gas
   * so a watcher with an EMPTY wallet can still execute through KeeperHub. The
   * agent never holds gas — KeeperHub's engine sponsors it.
   */
  sponsorGas?: boolean;
}


function buildContractCallBody(params: ContractCallParams, simulate: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contractAddress: params.contractAddress,
    chainId: params.chainId,
    functionName: params.functionName,
    // KeeperHub expects functionArgs as a JSON-array *string*
    functionArgs: JSON.stringify(params.functionArgs ?? []),
    gasLimitMultiplier: params.gasLimitMultiplier ?? "1.2",
    simulate,
  };
  if (params.abi) body.abi = JSON.stringify(params.abi);
  if (params.value) body.value = params.value;
  // Gas Sponsorship (§1.8): opt an empty-wallet watcher into org-sponsored gas.
  if (params.sponsorGas) body.sponsorGas = true;
  return body;
}


