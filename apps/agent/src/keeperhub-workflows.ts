/**
 * KeeperHub Workflow Builder integration (§1.3).
 *
 * The multi-step defense escalation (`topUpCollateral → partialUnwind →
 * pausePosition → notify`) is not just local orchestration: it is registered as
 * a REAL, addressable KeeperHub *workflow object* with a stable id/slug, so it
 * can be listed, inspected, versioned, and invoked framework-agnostically.
 *
 * Because KeeperHub's workflow-authoring surface is reached over MCP
 * (`tools/call` with a `create-workflow` / `list-workflows` style tool), we
 * discover the appropriate tool at runtime rather than hard-coding a REST route.
 * If the org's MCP server does not expose workflow-authoring tools (or is
 * unreachable in a demo), we fail SOFT to a durable *local workflow registry*
 * that assigns a deterministic slug and records the exact step graph — so the
 * workflow is still a first-class, listed, per-workflow object the dashboard and
 * incident report can reference. No silent pretending: the registry marks its
 * `source` as `local` vs `keeperhub` so provenance is always honest.
 */

import fs from "fs";
import path from "path";
import { KeeperHubMcpClient, McpTool } from "./keeperhub-mcp";
import { WorkflowStepDef, DEFAULT_DEFENSE_WORKFLOW } from "./workflows/defense-workflow";

export interface RegisteredWorkflow {
  /** Stable slug used in MCP per-workflow endpoints + dashboard links. */
  slug: string;
  /** KeeperHub workflow id when created remotely; mirrors slug locally. */
  workflowId: string;
  name: string;
  description: string;
  chainId: number;
  contractAddress: string;
  steps: WorkflowStepDef[];
  /** Honest provenance: where this workflow object actually lives. */
  source: "keeperhub" | "local";
  createdAt: string;
  /** The MCP tool used to create it (when source === keeperhub). */
  createdVia?: string;
}

export interface RegisterWorkflowArgs {
  apiKey: string;
  chainId: number;
  contractAddress: string;
  steps?: WorkflowStepDef[];
  name?: string;
  description?: string;
  dataDir: string;
  /** Optional MCP client injection (tests / reuse). */
  mcp?: KeeperHubMcpClient;
  log?: (msg: string) => void;
}

/** Candidate MCP tool names for workflow authoring (matched case-insensitively, fuzzy). */
const CREATE_TOOL_HINTS = ["create-workflow", "create_workflow", "createworkflow", "workflow-create", "add-workflow"];
const LIST_TOOL_HINTS = ["list-workflows", "list_workflows", "listworkflows", "workflows-list", "get-workflows"];

function deterministicSlug(contractAddress: string, chainId: number): string {
  return `sentinel-defense-${chainId}-${contractAddress.slice(2, 10).toLowerCase()}`;
}

function findTool(tools: McpTool[], hints: string[]): McpTool | undefined {
  const lower = tools.map((t) => ({ t, n: t.name.toLowerCase() }));
  for (const hint of hints) {
    const exact = lower.find((x) => x.n === hint);
    if (exact) return exact.t;
  }
  // Fuzzy: any tool whose name contains "workflow" AND "create"/"list".
  const key = hints[0].includes("create") ? "create" : "list";
  const fuzzy = lower.find((x) => x.n.includes("workflow") && x.n.includes(key));
  return fuzzy?.t;
}

function registryFile(dataDir: string): string {
  return path.join(dataDir, "workflows.json");
}

export function loadWorkflowRegistry(dataDir: string): RegisteredWorkflow[] {
  try {
    const f = registryFile(dataDir);
    if (!fs.existsSync(f)) return [];
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return [];
  }
}

function saveWorkflowRegistry(dataDir: string, list: RegisteredWorkflow[]) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(registryFile(dataDir), JSON.stringify(list, null, 2));
  } catch {
    /* best-effort persistence */
  }
}

/**
 * Ensure a real KeeperHub workflow object exists for this position's defense
 * sequence. Idempotent by slug: if we already registered it, return the record.
 */
export async function ensureDefenseWorkflow(args: RegisterWorkflowArgs): Promise<RegisteredWorkflow> {
  const log = args.log || ((m: string) => console.log(m));
  const steps = args.steps || DEFAULT_DEFENSE_WORKFLOW;
  const slug = deterministicSlug(args.contractAddress, args.chainId);
  const name = args.name || "Sentinel Mesh — Escalating Position Defense";
  const description =
    args.description ||
    "Simulate-first escalating defense: topUpCollateral → partialUnwind → pausePosition. Each step is dry-run through KeeperHub and only executed if simulation passes.";

  // Idempotency: reuse an existing registry entry for this slug.
  const registry = loadWorkflowRegistry(args.dataDir);
  const existing = registry.find((w) => w.slug === slug);
  if (existing) {
    log(`[Workflows] Reusing registered defense workflow "${existing.slug}" (source=${existing.source}).`);
    return existing;
  }

  const base: RegisteredWorkflow = {
    slug,
    workflowId: slug,
    name,
    description,
    chainId: args.chainId,
    contractAddress: args.contractAddress,
    steps,
    source: "local",
    createdAt: new Date().toISOString(),
  };

  // ---- Try to create it as a REAL KeeperHub workflow over MCP --------------
  try {
    const mcp = args.mcp || new KeeperHubMcpClient(args.apiKey);
    const tools = await mcp.listTools();
    const createTool = findTool(tools, CREATE_TOOL_HINTS);

    if (createTool) {
      log(`[Workflows] Creating KeeperHub workflow via MCP tool "${createTool.name}"...`);
      const result = await mcp.callTool(createTool.name, {
        name,
        slug,
        description,
        chainId: args.chainId,
        contractAddress: args.contractAddress,
        steps: steps.map((s) => ({
          id: s.id,
          label: s.label,
          type: "contract-call",
          functionName: s.functionName,
          functionArgs: s.functionArgs ?? [],
          simulateFirst: true,
          severity: s.severity,
        })),
      });

      if (!result.isError) {
        const remoteId =
          result.data?.workflowId || result.data?.id || result.data?.slug || slug;
        const created: RegisteredWorkflow = {
          ...base,
          workflowId: String(remoteId),
          slug: String(result.data?.slug || slug),
          source: "keeperhub",
          createdVia: createTool.name,
        };
        saveWorkflowRegistry(args.dataDir, [...registry, created]);
        log(`[Workflows] KeeperHub workflow created: id=${created.workflowId} slug=${created.slug}.`);
        return created;
      }
      log(`[Workflows] MCP create-workflow returned an error; falling back to local registry.`);
    } else {
      log(`[Workflows] No workflow-authoring MCP tool discovered; using local registry (honest provenance).`);
    }
  } catch (err: any) {
    log(`[Workflows] MCP workflow creation unavailable (${err?.message}); using local registry.`);
  }

  saveWorkflowRegistry(args.dataDir, [...registry, base]);
  return base;
}

/**
 * List workflow objects. Prefers a live MCP `list-workflows` call so the
 * dashboard reflects the org's real KeeperHub workflows; falls back to the local
 * registry when MCP authoring tools are not exposed.
 */
export async function listDefenseWorkflows(args: {
  apiKey: string;
  dataDir: string;
  mcp?: KeeperHubMcpClient;
  log?: (msg: string) => void;
}): Promise<{ source: "keeperhub" | "local"; workflows: any[] }> {
  const log = args.log || (() => {});
  try {
    const mcp = args.mcp || new KeeperHubMcpClient(args.apiKey);
    const tools = await mcp.listTools();
    const listTool = findTool(tools, LIST_TOOL_HINTS);
    if (listTool) {
      const result = await mcp.callTool(listTool.name, {});
      if (!result.isError && result.data) {
        const workflows = Array.isArray(result.data) ? result.data : result.data?.workflows ?? [];
        return { source: "keeperhub", workflows };
      }
    }
  } catch (err: any) {
    log(`[Workflows] MCP list unavailable (${err?.message}); returning local registry.`);
  }
  return { source: "local", workflows: loadWorkflowRegistry(args.dataDir) };
}
