"use client";

import { useEffect, useState } from "react";
import { api, StatusResponse } from "@/lib/api";
import { DialMeter } from "@/components/ui/DialMeter";

function hfToFraction(hf: number): number {
  if (!isFinite(hf)) return 1;
  return Math.max(0, Math.min(1, (hf - 1) / 1.5));
}

/**
 * The "mech card" landing preview of the real dashboard. Pulls live status so
 * the marketing page and the actual product never disagree.
 */
export function DashboardPreview() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let active = true;
    api.getStatus().then((s) => active && setStatus(s)).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const hf = status ? parseFloat(status.healthFactor) : NaN;
  const online = status?.isAgentOnline ?? false;
  const danger = isFinite(hf) && hf < 1.2;

  return (
    <div
      style={{
        background: "var(--ink)",
        borderRadius: 28,
        padding: 34,
        boxShadow: "rgba(18,17,42,0.16) 0px 30px 60px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {online && <span className="blink-dot" style={{ background: "var(--lime)", borderRadius: "50%", width: 8, height: 8 }} />}
          <span style={{ color: "var(--paper)", fontWeight: 600 }}>
            {online ? "Guardian online" : "Guardian offline"}
          </span>
        </div>
        <span className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 12 }}>
          {status?.chain ?? "Base Sepolia"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 32, alignItems: "center" }} className="preview-grid">
        <DialMeter
          value={status ? status.healthFactor : "—"}
          unit="Health factor"
          fraction={status ? hfToFraction(hf) : undefined}
          strokeColor={danger ? "var(--coral)" : "var(--lime)"}
          size={200}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            ["Position", "Aave · WETH/USDC"],
            ["Threshold", "1.20"],
            ["Last check", status ? "moments ago" : "—"],
            ["Settlement", "KeeperHub"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--ink-line)", paddingBottom: 10 }}>
              <span style={{ color: "var(--muted-on-dark)", fontSize: 14 }}>{k}</span>
              <span className="mono" style={{ color: "var(--paper)", fontSize: 13 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}