/**
 * KeeperHub MCP client (§1.2 — Model Context Protocol surface).
 *
 * KeeperHub exposes a Model Context Protocol (MCP) endpoint
 * (https://app.keeperhub.com/mcp, or a per-workflow `/mcp/w/<slug>`) so that
 * *any* framework-agnostic agent can DISCOVER and CALL KeeperHub tools without
 * hard-coding REST routes. This is the seam that lets a watcher speak "pure MCP"
 * instead of the bespoke Direct Execution REST client.
 *
 * We implement the Streamable-HTTP MCP transport directly (a single POST endpoint
 * that accepts JSON-RPC 2.0 requests and replies with either JSON or an SSE
 * stream). This keeps the agent dependency-light while being a REAL MCP client:
 *   - `initialize`         → protocol handshake
 *   - `tools/list`         → discover available KeeperHub tools
 *   - `tools/call`         → invoke a tool (e.g. execute-contract-call, list-workflows)
 *
 * Auth reuses the org-scoped `kh_` key via `Authorization: Bearer`.
 */

const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolCallResult {
  /** Structured content blocks returned by the tool. */
  content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  isError?: boolean;
  /** Convenience: parsed JSON from the first text block, if it was JSON. */
  data?: any;
}

export class McpError extends Error {
  code?: number;
  data?: any;
  constructor(message: string, code?: number, data?: any) {
    super(message);
    this.name = "McpError";
    this.code = code;
    this.data = data;
  }
}

export class KeeperHubMcpClient {
  private endpoint: string;
  private apiKey: string;
  private sessionId?: string;
  private nextId = 1;
  private initialized = false;

  constructor(apiKey: string, endpoint?: string) {
    if (!apiKey || !apiKey.startsWith("kh_")) {
      throw new McpError("KeeperHub MCP requires an organization-scoped kh_ API key.");
    }
    this.apiKey = apiKey;
    this.endpoint =
      endpoint || process.env.KEEPERHUB_MCP_URL || "https://app.keeperhub.com/mcp";
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      // MCP Streamable-HTTP clients must advertise they accept both.
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${this.apiKey}`,
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    };
    if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
    return h;
  }

  /** Low-level JSON-RPC round-trip. Handles both JSON and SSE-framed replies. */
  private async rpc(method: string, params?: Record<string, unknown>): Promise<any> {
    const id = this.nextId++;
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }),
    });

    // The server may hand back a session id on initialize.
    const sid = res.headers.get("Mcp-Session-Id");
    if (sid) this.sessionId = sid;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new McpError(`MCP ${method} failed (HTTP ${res.status}): ${text}`, res.status);
    }

    const contentType = res.headers.get("Content-Type") || "";
    const raw = await res.text();

    // Parse either a plain JSON-RPC response or an SSE stream of `data:` lines.
    const message = contentType.includes("text/event-stream")
      ? parseSseForRpc(raw, id)
      : safeJson(raw);

    if (message?.error) {
      throw new McpError(message.error.message || "MCP error", message.error.code, message.error.data);
    }
    return message?.result;
  }

  /** MCP handshake — must be called once before tools/list or tools/call. */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const result = await this.rpc("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      clientInfo: { name: "sentinel-mesh-watcher", version: "1.0.0" },
    });
    // Best-effort "notifications/initialized" (fire-and-forget; server may ignore).
    try {
      await fetch(this.endpoint, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      });
    } catch {
      /* non-fatal */
    }
    this.initialized = true;
    void result;
  }

  /** Discover the tools KeeperHub exposes over MCP. */
  async listTools(): Promise<McpTool[]> {
    await this.initialize();
    const result = await this.rpc("tools/list", {});
    const tools: any[] = result?.tools ?? [];
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /** Invoke a KeeperHub MCP tool by name with structured arguments. */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
    await this.initialize();
    const result = await this.rpc("tools/call", { name, arguments: args });
    const content: McpToolCallResult["content"] = result?.content ?? [];
    let data: any;
    const firstText = content.find((c) => c.type === "text" && typeof c.text === "string");
    if (firstText?.text) data = safeJson(firstText.text) ?? firstText.text;
    return { content, isError: result?.isError === true, data };
  }
}

/** Parse a JSON string, returning undefined instead of throwing. */
function safeJson(text: string): any {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract the JSON-RPC response with the matching id from an SSE body. MCP
 * servers frame replies as one or more `event:`/`data:` blocks.
 */
function parseSseForRpc(body: string, id: number): any {
  const lines = body.split(/\r?\n/);
  let match: any;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = safeJson(trimmed.slice(5).trim());
    if (payload && (payload.id === id || payload.id === undefined)) {
      match = payload;
      if (payload.id === id) break;
    }
  }
  return match;
}
