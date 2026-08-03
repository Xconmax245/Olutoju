"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Incident } from "@/lib/api";
import { relativeTime, shortHash } from "@/lib/format";

const OUTCOME_STYLE: Record<Incident["outcome"], { label: string; color: string; bg: string }> = {
  success: { label: "defended", color: "var(--lime)", bg: "var(--lime-bg)" },
  reverted: { label: "reverted", color: "var(--coral)", bg: "rgba(255,107,92,0.14)" },
  no_action: { label: "no action", color: "var(--muted-on-dark)", bg: "var(--ink-soft)" },
};

/**
 * Live proof band. Pulls the real incident feed; when the guardian hasn't
 * acted yet we show an honest empty state rather than fabricated stats.
 */
export function LiveStats() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .getIncidents()
        .then((data) => active && setIncidents(data))
        .catch(() => active && setIncidents([]));
    load();
    const t = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const recent = (incidents ?? []).slice(0, 4);
  const defended = (incidents ?? []).filter((i) => i.outcome === "success").length;

  return (
    <section
      id="live"
      style={{ background: "var(--ink)", padding: "110px 0" }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>
        <div
          className="io"
          data-dir="up"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 20, marginBottom: 48 }}
        >
          <div style={{ maxWidth: 620 }}>
            <span className="mono" style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--lime)", fontSize: 12 }}>
              Live incidents
            </span>
            <h2 style={{ color: "var(--paper)", marginTop: 14, fontSize: "clamp(30px, 3.6vw, 44px)", fontWeight: 700 }}>
              Every defense, on the record.
            </h2>
          </div>
          <div className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 13 }}>
            {incidents === null ? "loading…" : `${defended} defended · ${incidents.length} total`}
          </div>
        </div>

        {recent.length === 0 ? (
          <div
            className="io"
            data-dir="up"
            style={{
              border: "1px dashed var(--ink-line)",
              borderRadius: 20,
              padding: "48px 32px",
              textAlign: "center",
              color: "var(--muted-on-dark)",
            }}
          >
            {incidents === null
              ? "Fetching the incident feed…"
              : "No incidents yet — the guardian is watching and hasn't needed to act."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
            {recent.map((incident, i) => {
              const o = OUTCOME_STYLE[incident.outcome];
              return (
                <Link
                  key={incident.id}
                  href={`/dashboard?incident=${incident.id}`}
                  className="io"
                  data-dir="up"
                  style={{
                    background: "var(--ink-card)",
                    border: "1px solid var(--ink-line)",
                    borderRadius: 18,
                    padding: 22,
                    display: "block",
                    transitionDelay: `${i * 0.06}s`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <span className="mono" style={{ color: o.color, background: o.bg, borderRadius: 100, padding: "5px 10px", fontSize: 11 }}>
                      {o.label}
                    </span>
                    <span className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 11 }}>
                      {relativeTime(incident.timestamp)}
                    </span>
                  </div>
                  <div style={{ color: "var(--paper)", fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
                    {incident.actionTaken}
                  </div>
                  <div className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 12 }}>
                    {incident.triggerCondition}
                  </div>
                  {incident.txHash && (
                    <div className="mono" style={{ color: "var(--peri)", fontSize: 12, marginTop: 12 }}>
                      {shortHash(incident.txHash)}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}