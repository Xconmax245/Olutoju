const STACK = ["Aave", "Base Sepolia", "KeeperHub", "MCP", "viem"];

/** Quiet trust band listing the real stack the guardian is built on. */
export function Integrations() {
  return (
    <section style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 32px 30px" }}>
      <div
        className="io"
        data-dir="up"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: "18px 44px" }}
      >
        <span className="mono" style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12 }}>
          Built on
        </span>
        {STACK.map((s) => (
          <span key={s} style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, opacity: 0.8 }}>
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}