"use client";

/**
 * MeshPanel — surfaces the "Workflow Builder" story on the operator dashboard:
 * the independent watcher fleet + latest race, the KeeperHub MCP tools that were
 * actually discovered, and the registered defense workflow object(s). Every value
 * is fetched live from the agent (which proxies to KeeperHub), and provenance is
 * shown honestly (e.g. workflow `source: keeperhub | local`).
 */

import React, { useEffect, useState } from "react";


interface Watcher {
  id: string;
  framework?: string;
  address?: string;
}
interface Proposal {
  watcher: Watcher;
  functionName?: string;
  detectionLatencyMs?: number;
  simulationValid?: boolean;
  rank?: number;
  slashed?: boolean;
}
interface MeshResponse {
  enabled?: boolean;
  mode?: string;
  fleet?: Watcher[];
  watchers?: Watcher[];
  lastRace?: {
    raceId?: string;
    policy?: string;
    winner?: Proposal;
    proposals?: Proposal[];
    slashedStakeTotal?: string;
  } | null;
}
interface WorkflowsResponse {
  source?: string;
  via?: string;
  workflows?: Array<{ slug?: string; name?: string; source?: string; workflowId?: string; verified?: boolean }>;
  registered?: Array<{ slug?: string; name?: string; source?: string; workflowId?: string; verified?: boolean }>;
}
interface McpToolsResponse {
  endpoint?: string;
  count?: number;
  tools?: Array<{ name: string; description?: string }>;
  error?: string;
}

const card: React.CSSProperties = {
  background: "var(--paper)",
  border: "1.5px solid var(--paper-line)",
  borderRadius: 20,
  padding: 24,
};
const heading: React.CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--muted)",
  fontSize: 12,
  marginBottom: 14,
};
const pill = (color: string, bg: string): React.CSSProperties => ({
  color,
  background: bg,
  borderRadius: 100,
  padding: "3px 9px",
  fontSize: 11,
  fontWeight: 600,
});

export function MeshPanel() {
  const [mesh, setMesh] = useState<MeshResponse | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowsResponse | null>(null);
  const [tools, setTools] = useState<McpToolsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = React.useCallback(async () => {
    try {
      const [m, w, t] = await Promise.all([
        fetch("/api/mesh", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/workflows", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/mcp/tools", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      setMesh(m);
      setWorkflows(w);
      setTools(t);
      setError(null);
    } catch {
      setError("Mesh telemetry unavailable — is the agent running?");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    // Refresh on live race events too.
    const es = new EventSource("/api/stream");
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === "MESH_RACE" || d.type === "INCIDENT_CREATED") load();
      } catch {}
    };
    return () => {
      clearInterval(id);
      es.close();
    };
  }, [load]);

  const race = mesh?.lastRace;
  const watchers = mesh?.fleet ?? mesh?.watchers ?? [];
  const wfList = workflows?.workflows ?? workflows?.registered ?? [];

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button 
          onClick={() => setExpanded(!expanded)} 
          style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 11, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}
        >
          {expanded ? "▼" : "▶"} Advanced: Sentinel Mesh Telemetry
        </button>
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, opacity: expanded ? 1 : 0, transition: "opacity 0.2s ease-in-out" }}>
          {/* Watcher fleet + latest race */}
      <div style={{ ...card, background: "var(--ink)", borderColor: "var(--ink-line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ ...heading, color: "var(--muted-on-dark)", margin: 0 }}>Sentinel mesh</h2>
          <span style={pill(mesh?.enabled ? "var(--lime)" : "var(--muted-on-dark)", "var(--ink-card)")}>
            {mesh?.enabled ? `${watchers.length} watchers · ${mesh?.mode ?? "worker"}` : "mesh off"}
          </span>
        </div>

        {watchers.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: race ? 18 : 0 }}>
            {watchers.map((w) => (
              <span key={w.id} className="mono" style={{ ...pill("var(--peri)", "var(--ink-card)"), border: "1px solid var(--ink-line)" }}>
                {w.id}{w.framework ? ` · ${w.framework}` : ""}
              </span>
            ))}
          </div>
        )}

        {race ? (
          <div style={{ borderTop: "1px solid var(--ink-line)", paddingTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 11 }}>
                {race.policy ?? "first-valid-simulation-wins"}
              </span>
              {race.slashedStakeTotal && race.slashedStakeTotal !== "0" && (
                <span style={pill("var(--coral)", "var(--coral-bg)")}>slashed {race.slashedStakeTotal}</span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(race.proposals ?? []).map((p, i) => {
                const isWinner = race.winner && p.watcher?.id === race.winner.watcher?.id;
                return (
                  <div
                    key={p.watcher?.id ?? i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: isWinner ? "var(--lime-bg)" : "var(--ink-card)",
                      border: `1px solid ${isWinner ? "var(--lime)" : "var(--ink-line)"}`,
                      borderRadius: 12,
                      padding: "10px 14px",
                    }}
                  >
                    <span style={{ color: isWinner ? "var(--ink)" : "var(--paper)", fontSize: 13, fontWeight: 600 }}>
                      {isWinner ? "🏆 " : ""}{p.watcher?.id} → {p.functionName ?? "—"}
                    </span>
                    <span className="mono" style={{ color: isWinner ? "var(--ink)" : "var(--muted-on-dark)", fontSize: 11 }}>
                      {p.slashed ? "slashed" : p.simulationValid === false ? "invalid" : `${p.detectionLatencyMs ?? "?"}ms`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 12, paddingTop: 6 }}>
            No race yet — trigger chaos mode to watch the fleet compete.
          </div>
        )}
      </div>

      {/* KeeperHub workflow objects */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ ...heading, margin: 0 }}>Workflow objects</h2>
          {workflows?.source && (
            <span style={pill(workflows.source === "keeperhub" ? "var(--ink)" : "var(--muted)", workflows.source === "keeperhub" ? "var(--lime)" : "var(--ink-soft)")}>
              {workflows.source}{workflows.via ? ` · ${workflows.via}` : ""}
            </span>
          )}
        </div>
        {wfList.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {wfList.map((wf, i) => (
              <div key={wf.slug ?? i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < wfList.length - 1 ? "1px solid var(--paper-line)" : "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{wf.name ?? wf.slug}</div>
                  <div className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{wf.slug}</div>
                </div>
                <span style={pill((wf.source ?? workflows?.source) === "keeperhub" ? "var(--ink)" : "var(--muted)", (wf.source ?? workflows?.source) === "keeperhub" ? "var(--lime-bg)" : "var(--ink-soft)")}>
                  {wf.source ?? workflows?.source ?? "local"}{wf.verified ? " ✓" : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>No workflow objects registered yet.</div>
        )}
      </div>

      {/* MCP tools discovered */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ ...heading, margin: 0 }}>KeeperHub MCP tools</h2>
          <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{tools?.count ?? tools?.tools?.length ?? 0} discovered</span>
        </div>
        {tools?.error ? (
          <div className="mono" style={{ color: "var(--coral)", fontSize: 12 }}>MCP: {tools.error}</div>
        ) : tools?.tools && tools.tools.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {tools.tools.map((t) => (
              <span key={t.name} className="mono" title={t.description} style={pill("var(--ink)", "var(--peri-bg, #e9e6fb)")}>
                {t.name}
              </span>
            ))}
          </div>
        ) : (
          <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>No tools discovered (agent may be offline).</div>
        )}
        {tools?.endpoint && (
          <div className="mono" style={{ color: "var(--muted)", fontSize: 10, marginTop: 12 }}>{tools.endpoint}</div>
        )}
      </div>

      {error && <div className="mono" style={{ color: "var(--coral)", fontSize: 12 }}>{error}</div>}
        </div>
      )}
    </section>
  );
}
