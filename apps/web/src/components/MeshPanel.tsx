"use client";

/**
 * MeshPanel — Sentinel Mesh fleet + race, Workflow Objects, MCP Tools.
 * Always visible, three-column grid.
 */

import React, { useEffect, useState } from "react";

interface Watcher { id: string; framework?: string; address?: string; }
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
  padding: 22,
};
const darkCard: React.CSSProperties = {
  background: "var(--ink)",
  border: "1px solid var(--ink-line)",
  borderRadius: 20,
  padding: 22,
};
const sectionLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--muted)",
  fontSize: 11,
  marginBottom: 14,
  display: "block",
};
const pill = (color: string, bg: string): React.CSSProperties => ({
  color,
  background: bg,
  borderRadius: 100,
  padding: "3px 10px",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap" as const,
});

export function MeshPanel() {
  const [mesh, setMesh] = useState<MeshResponse | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowsResponse | null>(null);
  const [tools, setTools] = useState<McpToolsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [m, w, t] = await Promise.all([
        fetch("/api/mesh", { cache: "no-store" }).then(r => r.json()).catch(() => null),
        fetch("/api/workflows", { cache: "no-store" }).then(r => r.json()).catch(() => null),
        fetch("/api/mcp/tools", { cache: "no-store" }).then(r => r.json()).catch(() => null),
      ]);
      setMesh(m); setWorkflows(w); setTools(t); setError(null);
    } catch {
      setError("Mesh telemetry unavailable — is the agent running?");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    const es = new EventSource("/api/stream");
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === "MESH_RACE" || d.type === "INCIDENT_CREATED") load();
      } catch {}
    };
    return () => { clearInterval(id); es.close(); };
  }, [load]);

  const race = mesh?.lastRace;
  const watchers = mesh?.fleet ?? mesh?.watchers ?? [];
  const wfList = workflows?.workflows ?? workflows?.registered ?? [];
  // A workflow is from KeeperHub if the top-level response source is "keeperhub"
  // (meaning the list came from the live MCP connection) OR if the item itself says so.
  const listIsKeeperHub = workflows?.source === "keeperhub";

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Section header with divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="mono" style={{ ...sectionLabel, marginBottom: 0, whiteSpace: "nowrap" }}>Sentinel Mesh</span>
        <span style={{ flex: 1, height: 1, background: "var(--paper-line)" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }} className="mesh-grid">

        {/* ── Card 1: Watcher fleet + race result ── */}
        <div style={darkCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ ...sectionLabel, marginBottom: 0, color: "var(--muted-on-dark)" }}>Watcher fleet</span>
            <span style={pill(
              mesh?.enabled ? "var(--lime)" : "var(--muted-on-dark)",
              "var(--ink-card)"
            )}>
              {mesh?.enabled ? `${watchers.length} active` : "mesh off"}
            </span>
          </div>

          {/* Fleet tags */}
          {watchers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {watchers.map(w => (
                <span key={w.id} className="mono" style={{
                  ...pill("var(--peri)", "var(--ink-card)"),
                  border: "1px solid var(--ink-line)",
                  fontSize: 10,
                }}>
                  {w.id}{w.framework ? ` · ${w.framework}` : ""}
                </span>
              ))}
            </div>
          )}

          {/* Race result */}
          {race ? (
            <div style={{ borderTop: "1px solid var(--ink-line)", paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 10 }}>
                  {race.policy ?? "first-valid-simulation-wins"}
                </span>
                {race.slashedStakeTotal && race.slashedStakeTotal !== "0" && (
                  <span style={pill("var(--coral)", "var(--coral-bg)")}>
                    slashed
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(race.proposals ?? []).map((p, i) => {
                  const isWinner = race.winner && p.watcher?.id === race.winner.watcher?.id;
                  return (
                    <div key={p.watcher?.id ?? i} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: isWinner ? "var(--lime-bg)" : "var(--ink-card)",
                      border: `1px solid ${isWinner ? "rgba(214,255,79,0.4)" : "var(--ink-line)"}`,
                      borderRadius: 10,
                      padding: "9px 12px",
                    }}>
                      <span style={{ color: isWinner ? "var(--lime)" : "var(--paper)", fontSize: 12, fontWeight: 600 }}>
                        {isWinner ? "🏆 " : ""}{p.watcher?.id}
                        <span style={{ color: isWinner ? "var(--lime)" : "var(--muted-on-dark)", fontWeight: 400 }}>
                          {" → "}{p.functionName ?? "—"}
                        </span>
                      </span>
                      <span className="mono" style={{ color: isWinner ? "var(--lime)" : "var(--muted-on-dark)", fontSize: 10 }}>
                        {p.slashed ? "slashed" : p.simulationValid === false ? "invalid" : `${p.detectionLatencyMs ?? "?"}ms`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 12 }}>
              No race yet — trigger chaos mode to watch the fleet compete.
            </div>
          )}
        </div>

        {/* ── Card 2: Workflow objects ── */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={sectionLabel}>Workflow objects</span>
            {/* Source badge: show keeperhub only when the live MCP list succeeded */}
            <span style={pill(
              listIsKeeperHub ? "var(--ink)" : "var(--muted)",
              listIsKeeperHub ? "var(--lime)" : "rgba(90,85,120,0.15)"
            )}>
              {listIsKeeperHub ? "keeperhub" : "local registry"}
            </span>
          </div>

          {wfList.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {wfList.map((wf, i) => (
                <div key={wf.slug ?? i} style={{
                  padding: "12px 14px",
                  background: "var(--ink)",
                  borderRadius: 12,
                  border: "1px solid var(--ink-line)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "var(--paper)", fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>
                        {wf.name ?? wf.slug}
                      </div>
                      <div className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 10 }}>
                        {wf.slug}
                      </div>
                    </div>
                    <span style={pill(
                      listIsKeeperHub ? "var(--lime)" : "var(--muted-on-dark)",
                      listIsKeeperHub ? "rgba(214,255,79,0.12)" : "var(--ink-card)"
                    )}>
                      {listIsKeeperHub ? "keeperhub" : (wf.source ?? "local")}
                      {wf.verified ? " ✓" : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>No workflow objects registered yet.</div>
          )}
        </div>

        {/* ── Card 3: MCP tools ── */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={sectionLabel}>KeeperHub MCP tools</span>
            <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
              {tools?.count ?? tools?.tools?.length ?? 0} discovered
            </span>
          </div>

          {tools?.error ? (
            <div className="mono" style={{ color: "var(--coral)", fontSize: 12 }}>MCP offline: {tools.error}</div>
          ) : tools?.tools && tools.tools.length > 0 ? (
            <div style={{ maxHeight: 220, overflowY: "auto" }} className="hide-scrollbar">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {tools.tools.map(t => (
                  <span key={t.name} className="mono" title={t.description} style={{
                    color: "var(--ink)",
                    background: "rgba(185,174,251,0.18)",
                    borderRadius: 100,
                    padding: "3px 9px",
                    fontSize: 10,
                    fontWeight: 500,
                    border: "1px solid rgba(185,174,251,0.25)",
                  }}>
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>No tools discovered (agent may be offline).</div>
          )}

          {tools?.endpoint && (
            <div className="mono" style={{ color: "var(--muted)", fontSize: 10, marginTop: 12, borderTop: "1px solid var(--paper-line)", paddingTop: 10 }}>
              {tools.endpoint}
            </div>
          )}
        </div>
      </div>

      {error && <div className="mono" style={{ color: "var(--coral)", fontSize: 12 }}>{error}</div>}
    </section>
  );
}
