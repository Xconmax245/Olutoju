import Link from "next/link";
import { DialMeter } from "@/components/ui/DialMeter";

export function FinalCTA() {
  return (
    <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 32px 120px" }}>
      <div
        className="io"
        data-dir="up"
        style={{
          background: "var(--ink)",
          borderRadius: 34,
          padding: "72px 48px",
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 40,
          alignItems: "center",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div>
          <h2 style={{ color: "var(--paper)", fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 700, lineHeight: 1.05 }}>
            Let the guardian
            <br />
            <span style={{ color: "var(--lime)" }}>keep watch.</span>
          </h2>
          <p style={{ color: "var(--muted-on-dark)", margin: "20px 0 34px", maxWidth: 440, fontSize: 17, lineHeight: 1.6 }}>
            Open the live dashboard and watch Olutoju monitor, simulate, and
            defend a real position in real time.
          </p>
          <Link href="/dashboard" className="btn-primary">
            View live guardian →
          </Link>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }} className="cta-dial">
          <div className="floaty">
            <DialMeter value="2.14" unit="Health factor" size={220} />
          </div>
        </div>
      </div>
    </section>
  );
}