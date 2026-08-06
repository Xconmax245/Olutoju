"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, StatusResponse } from "@/lib/api";
import { DialMeter } from "@/components/ui/DialMeter";

/**
 * Maps a health factor to a 0..1 ring fill. A HF of 1.0 is liquidation;
 * anything at/above 2.5 reads as fully healthy. Purely for the visual ring —
 * the numeric readout is always the real value.
 */
function hfToFraction(hf: number): number {
  if (!isFinite(hf)) return 1;
  return Math.max(0, Math.min(1, (hf - 1) / 1.5));
}

export function Hero() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getStatus()
      .then((s) => active && setStatus(s))
      .catch(() => active && setStatus(null));
    return () => {
      active = false;
    };
  }, []);

  const hf = status ? parseFloat(status.healthFactor) : NaN;
  const readout = status ? status.healthFactor : "—";
  const fraction = status ? hfToFraction(hf) : undefined;
  const danger = isFinite(hf) && hf < 1.2;
  const online = status?.isAgentOnline ?? false;

  return (
    <section
      className="hero"
      style={{
        display: "grid",
        gridTemplateColumns: "1.05fr 0.95fr",
        alignItems: "center",
        gap: 40,
        maxWidth: 1200,
        margin: "0 auto",
        padding: "72px 32px 60px",
        position: "relative",
      }}
    >
      <div>
        <h1
          className="io"
          data-dir="up"
          style={{ fontSize: "clamp(42px, 5.4vw, 74px)", fontWeight: 700 }}
        >
          The last mile between
          <br />
          your position and{" "}
          <span style={{ color: "var(--coral)" }}>disaster.</span>
        </h1>
        <p
          className="io"
          data-dir="up"
          style={{
            color: "var(--muted)",
            maxWidth: 480,
            marginTop: 24,
            fontSize: 19,
            lineHeight: 1.55,
            transitionDelay: ".1s",
          }}
        >
          Olutoju watches your DeFi positions and acts the moment they're at
          risk — every defense simulated first, cryptographically signed, and
          settled on-chain via KeeperHub.
        </p>
        <div
          className="io"
          data-dir="up"
          style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 36, transitionDelay: ".2s" }}
        >
          <Link href="/dashboard" className="btn-primary">
            View live guardian →
          </Link>
          <a href="#how" className="btn-secondary">
            How it works
          </a>
        </div>
      </div>

      <div
        className="io"
        data-dir="right"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: 420,
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            filter: "blur(6px)",
            background:
              "radial-gradient(circle, rgba(214,255,79,0.35), rgba(214,255,79,0) 70%)",
            borderRadius: "50%",
            width: "min(340px, 90vw)",
            height: "min(340px, 90vw)",
            position: "absolute",
          }}
        />
        <div className="floaty">
          <div
            className="hero-card"
            style={{
              background: "var(--ink)",
              borderRadius: 32,
              width: "min(340px, 100%)",
              padding: 38,
              position: "relative",
              transform: "perspective(900px) rotateY(-6deg) rotateX(2deg)",
              boxShadow: "rgba(18,17,42,0.1) 14px 18px",
            }}
          >
            <DialMeter
              value={readout}
              unit="Health factor"
              fraction={fraction}
              strokeColor={danger ? "var(--coral)" : "var(--lime)"}
            />
            <div
              style={{
                color: "var(--paper)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 26,
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {online && (
                  <span
                    className="blink-dot"
                    style={{
                      background: "var(--lime)",
                      borderRadius: "50%",
                      width: 7,
                      height: 7,
                      display: "inline-block",
                    }}
                  />
                )}
                <span>{online ? "Guardian online" : "Guardian offline"}</span>
              </div>
              <span
                className="mono"
                style={{
                  color: "var(--lime)",
                  background: "var(--lime-bg)",
                  borderRadius: 100,
                  padding: "5px 10px",
                  fontSize: 12,
                }}
              >
                via KeeperHub
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}