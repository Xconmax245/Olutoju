"use client";

import React, { useEffect, useState, useMemo } from "react";
import { api, Incident, StatusResponse, Attestation, HistoryPoint } from "@/lib/api";
import Link from "next/link";
import { ethers } from "ethers";
import { Logo } from "@/components/ui/Logo";
import { DialMeter } from "@/components/ui/DialMeter";
import { MeshPanel } from "@/components/MeshPanel";
import { clockTime, relativeTime, shortHash } from "@/lib/format";

function hfToFraction(hf: number): number {
  if (!isFinite(hf)) return 1;
  return Math.max(0, Math.min(1, (hf - 1) / 1.5));
}

const OUTCOME: Record<Incident["outcome"], { label: string; color: string; bg: string }> = {
  success: { label: "defended", color: "var(--lime)", bg: "var(--lime-bg)" },
  reverted: { label: "reverted", color: "var(--coral)", bg: "var(--coral-bg)" },
  no_action: { label: "no action", color: "var(--muted-on-dark)", bg: "var(--ink-soft)" },
};

export default function Dashboard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  const [incidentTab, setIncidentTab] = useState<"activity" | "outcome">("activity");
  const [timeframe, setTimeframe] = useState<"Hour" | "Day" | "Week">("Hour");
  const [positionMenuOpen, setPositionMenuOpen] = useState(false);
  const [isSwitchingPosition, setIsSwitchingPosition] = useState(false);

  const [isTriggering, setIsTriggering] = useState(false);
  const [selectedAttestation, setSelectedAttestation] = useState<Attestation | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<boolean | null>(null);

  useEffect(() => {
    api.getStatus().then(setStatus).catch(console.error);
    api.getIncidents().then(setIncidents).catch(console.error);
  }, []);

  useEffect(() => {
    api.getHistory(timeframe).then(setHistory).catch(console.error);
  }, [timeframe]);

  // Server-Sent Events for live streaming
  useEffect(() => {
    const eventSource = new EventSource("/api/stream");
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "INCIDENT_CREATED") {
          setIncidents((prev) => [data.payload, ...prev]);
        } else if (data.type === "STATUS_UPDATE") {
          setStatus(data.payload);
        }
      } catch (err) {
        console.error("Failed to parse SSE", err);
      }
    };
    return () => eventSource.close();
  }, []);

  const handleChaosMode = async () => {
    setIsTriggering(true);
    try {
      await api.triggerChaosMode();
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => setIsTriggering(false), 1000);
  };

  const handleForceCheck = async () => {
    const updated = await api.getStatus();
    setStatus(updated);
  };

  const handleSwitchPosition = async (positionId: string) => {
    setIsSwitchingPosition(true);
    setPositionMenuOpen(false);
    try {
      const updated = await api.setActivePosition(positionId);
      setStatus(updated);
      setHistory(await api.getHistory(timeframe));
    } catch (e) {
      console.error(e);
    } finally {
      setIsSwitchingPosition(false);
    }
  };

  const handleViewAttestation = async (id: string) => {
    try {
      const data = await api.getAttestation(id);
      setSelectedAttestation(data);
      setVerificationResult(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerify = () => {
    setIsVerifying(true);
    setTimeout(() => {
      try {
        if (!selectedAttestation) return;
        const { payload, signature, verifier_pubkey } = selectedAttestation;
        const recovered = ethers.verifyMessage(payload, signature);
        setVerificationResult(recovered.toLowerCase() === verifier_pubkey.toLowerCase());
      } catch {
        setVerificationResult(false);
      }
      setIsVerifying(false);
    }, 800);
  };

  const filteredIncidents = useMemo(
    () =>
      incidentTab === "outcome"
        ? incidents.filter((i) => i.outcome === "success" || i.outcome === "reverted")
        : incidents,
    [incidents, incidentTab]
  );

  const hf = status ? parseFloat(status.healthFactor) : NaN;
  const danger = isFinite(hf) && hf < 1.2;
  const online = status?.isAgentOnline ?? false;
  const defended = incidents.filter((i) => i.outcome === "success").length;
  const activePosition =
    status?.positions?.find((p) => p.id === status.activePositionId)?.label ||
    status?.positions?.[0]?.label ||
    "Aave · WETH/USDC";

  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)", paddingBottom: 40 }}>
      {/* HEADER */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "rgba(243,240,250,0.9)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid var(--paper-line)",
        }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/" style={{ fontFamily: "var(--font-display)", display: "flex", alignItems: "center", gap: 9, fontSize: 19, fontWeight: 700 }}>
              <Logo />
              olutoju
            </Link>
            <span style={{ width: 1, height: 22, background: "var(--paper-line)" }} />
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setPositionMenuOpen((o) => !o)}
                aria-expanded={positionMenuOpen}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}
              >
                {isSwitchingPosition ? "Switching…" : activePosition}
                <span className="mono" style={{ color: "var(--coral)" }}>{positionMenuOpen ? "▴" : "▾"}</span>
              </button>
              {positionMenuOpen && status?.positions && (
                <div style={{ position: "absolute", left: 0, top: "calc(100% + 8px)", width: 250, background: "var(--paper)", border: "1px solid var(--paper-line)", borderRadius: 14, boxShadow: "rgba(18,17,42,0.18) 0px 12px 30px", padding: 8, zIndex: 40 }}>
                  {status.positions.map((pos) => {
                    const isActive = pos.id === status.activePositionId;
                    return (
                      <button
                        key={pos.id}
                        onClick={() => handleSwitchPosition(pos.id)}
                        style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, background: isActive ? "var(--lime-bg)" : "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600 }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? "var(--coral)" : "var(--muted)" }} />
                          {pos.label}
                        </span>
                        <span className="mono" style={{ display: "block", color: "var(--muted)", fontSize: 11, marginTop: 4, paddingLeft: 14 }}>
                          {shortHash(pos.address)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="mono" title="Confirmed defenses" style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--ink)", color: "var(--lime)", padding: "6px 12px", borderRadius: 100, fontSize: 12 }}>
              <span className="blink-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--lime)" }} />
              {defended} defended
            </div>
            <span className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>{status?.chain || "…"}</span>
          </div>
        </div>
      </header>

      {/* BANNER */}
      {status?.bannerMessage && (
        <div style={{ maxWidth: 1120, margin: "24px auto 0", padding: "0 24px" }}>
          <div style={{ background: "var(--coral-bg)", borderLeft: "3px solid var(--coral)", borderRadius: 12, padding: "14px 18px", color: "var(--coral)", fontWeight: 600, fontSize: 14 }}>
            {status.bannerMessage}
          </div>
        </div>
      )}

      {/* GRID */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }} className="dash-grid">
        {/* LEFT: OVERVIEW */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Primary readout — dark mech card */}
          <section style={{ background: "var(--ink)", borderRadius: 24, padding: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {online && <span className="blink-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--lime)" }} />}
                <span style={{ color: "var(--paper)", fontWeight: 600 }}>{online ? "Guardian online" : "Guardian offline"}</span>
              </div>
              <span className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 12 }}>
                {status?.lastCheckedAt ? relativeTime(status.lastCheckedAt) : "—"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <DialMeter
                value={status?.healthFactor || "—"}
                unit="Health factor"
                fraction={status ? hfToFraction(hf) : undefined}
                strokeColor={danger ? "var(--coral)" : "var(--lime)"}
                size={240}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 24, color: "var(--muted-on-dark)", fontSize: 13 }}>
              <span>Threshold <b style={{ color: "var(--paper)" }}>1.20</b></span>
              <span style={{ opacity: 0.4 }}>•</span>
              <span>Settled via <b style={{ color: "var(--paper)" }}>KeeperHub</b></span>
            </div>
          </section>

          {/* History chart — paper card */}
          <section style={{ background: "var(--paper)", border: "1.5px solid var(--paper-line)", borderRadius: 20, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 className="mono" style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", fontSize: 12 }}>History</h2>
              <div style={{ display: "flex", gap: 6 }}>
                {(["Hour", "Day", "Week"] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    style={{ fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 100, background: timeframe === tf ? "var(--ink)" : "transparent", color: timeframe === tf ? "var(--lime)" : "var(--muted)" }}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 130, width: "100%", position: "relative" }}>
              <SparklineChart data={history} />
            </div>
          </section>

          {/* Guardian actions */}
          <section>
            <h2 className="mono" style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", fontSize: 12, marginBottom: 12 }}>Guardian actions</h2>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={handleChaosMode} disabled={isTriggering} className="btn-primary" style={{ opacity: isTriggering ? 0.5 : 1 }}>
                {isTriggering ? "Triggering…" : "⚡ Chaos mode"}
              </button>
              <button onClick={handleForceCheck} className="btn-secondary">↻ Force check</button>
              {incidents[0]?.outcome === "success" && (
                <button onClick={() => handleViewAttestation(incidents[0].id)} className="btn-secondary">◈ Latest attestation</button>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT: INCIDENTS */}
        <section style={{ background: "var(--ink)", borderRadius: 24, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 24px", borderBottom: "1px solid var(--ink-line)" }}>
            <h2 style={{ color: "var(--paper)", fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600 }}>Incidents</h2>
            <div style={{ display: "flex", gap: 16 }}>
              {(["activity", "outcome"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setIncidentTab(t)}
                  style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize", color: incidentTab === t ? "var(--lime)" : "var(--muted-on-dark)" }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14, maxHeight: 620 }}>
            {filteredIncidents.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--muted-on-dark)", fontSize: 13, padding: "48px 16px", border: "1px dashed var(--ink-line)", borderRadius: 14 }}>
                No incidents match the filter — the guardian is watching.
              </div>
            ) : (
              filteredIncidents.map((incident) => {
                const o = OUTCOME[incident.outcome];
                return (
                  <div key={incident.id} style={{ background: "var(--ink-card)", border: "1px solid var(--ink-line)", borderRadius: 16, padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div style={{ color: "var(--paper)", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{incident.triggerCondition}</div>
                        <span className="mono" style={{ color: o.color, background: o.bg, borderRadius: 100, padding: "4px 10px", fontSize: 11 }}>{o.label}</span>
                      </div>
                      <span className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 11, whiteSpace: "nowrap" }}>{clockTime(incident.timestamp)}</span>
                    </div>
                    <div style={{ color: "var(--muted-on-dark)", fontSize: 13, lineHeight: 1.5 }}>
                      <b style={{ color: "var(--paper)" }}>Action:</b> {incident.actionTaken}
                    </div>
                    {incident.txHash && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                        <a href={`https://sepolia.basescan.org/tx/${incident.txHash}`} target="_blank" rel="noreferrer" className="mono" style={{ color: "var(--peri)", fontSize: 12 }}>
                          {shortHash(incident.txHash)} ↗
                        </a>
                        {incident.gasUsed && <span className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 11 }}>Gas {incident.gasUsed}</span>}
                      </div>
                    )}
                    {incident.outcome === "success" && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--ink-line)" }}>
                        <button onClick={() => handleViewAttestation(incident.id)} style={{ color: "var(--lime)", fontSize: 12, fontWeight: 600 }}>
                          ◈ View attestation proof
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* SENTINEL MESH — Workflow Builder surface (fleet, workflows, MCP tools) */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px 12px" }}>
        <MeshPanel />
      </div>

      {/* ATTESTATION MODAL */}
      {selectedAttestation && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(18,17,42,0.6)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: 640, background: "var(--paper)", borderRadius: 22, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 24px", borderBottom: "1px solid var(--paper-line)" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 }}>Cryptographic attestation</h3>
              <button onClick={() => setSelectedAttestation(null)} style={{ color: "var(--muted)", fontSize: 20 }}>✕</button>
            </div>
            <div className="mono" style={{ flex: 1, overflowY: "auto", padding: 24, background: "var(--ink)", color: "var(--muted-on-dark)", fontSize: 12 }}>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
                {JSON.stringify(selectedAttestation, null, 2)}
              </pre>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "20px 24px", borderTop: "1px solid var(--paper-line)", flexWrap: "wrap" }}>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
                {verificationResult === true && <span style={{ color: "var(--ink)", background: "var(--lime)", padding: "6px 12px", borderRadius: 100 }}>✓ Signature valid</span>}
                {verificationResult === false && <span style={{ color: "var(--paper)", background: "var(--coral)", padding: "6px 12px", borderRadius: 100 }}>✕ Signature invalid</span>}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(selectedAttestation, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `attestation-${selectedAttestation.incident_id}.json`;
                    a.click();
                  }}
                  className="btn-secondary"
                  style={{ padding: "10px 18px", fontSize: 13 }}
                >
                  Download JSON
                </button>
                <button onClick={handleVerify} disabled={isVerifying || verificationResult === true} className="btn-primary" style={{ padding: "10px 18px", fontSize: 13, opacity: isVerifying || verificationResult === true ? 0.5 : 1 }}>
                  {isVerifying ? "Verifying…" : "Verify signature"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// Catmull-Rom to Bezier helper
function catmullRom2bezier(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function SparklineChart({ data }: { data: HistoryPoint[] }) {
  if (!data || data.length === 0)
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 12 }}>
        Loading…
      </div>
    );

  const min = Math.min(...data.map((d) => d.value)) * 0.95;
  const max = Math.max(...data.map((d) => d.value)) * 1.05;
  const range = max - min;
  const w = 800;
  const h = 200;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = range === 0 ? h / 2 : h - ((d.value - min) / range) * h;
    return { x, y };
  });

  const pathD = catmullRom2bezier(points);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(185,174,251,0.28)" />
            <stop offset="100%" stopColor="rgba(185,174,251,0)" />
          </linearGradient>
        </defs>
        <path d={`${pathD} L ${w},${h} L 0,${h} Z`} fill="url(#chartGradient)" />
        <path d={pathD} fill="none" stroke="var(--peri)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.length > 0 && (
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4.5" fill="var(--coral)" />
        )}
      </svg>
    </div>
  );
}