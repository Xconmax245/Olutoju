const FEATURES = [
  {
    title: "Simulated before it's signed",
    body: "Every defensive action is dry-run against a fork first. If it wouldn't improve the position, it never leaves the guardian.",
    accent: "var(--lime)",
  },
  {
    title: "Signed attestations",
    body: "Each incident produces a cryptographically signed record — trigger, simulation, tx hash, and final state — that anyone can verify.",
    accent: "var(--peri)",
  },
  {
    title: "Settled via KeeperHub",
    body: "Transactions are relayed through KeeperHub, so execution is reliable and doesn't depend on your wallet being online.",
    accent: "var(--coral)",
  },
  {
    title: "Reads straight from chain",
    body: "Health factors come directly from Aave on Base Sepolia — no oracle middleman, no stale dashboard numbers.",
    accent: "var(--lime)",
  },
];

export function FeaturesGrid() {
  return (
    <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 32px 120px" }}>
      <div className="io" data-dir="up" style={{ maxWidth: 640, marginBottom: 56 }}>
        <span className="mono" style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--coral)", fontSize: 12 }}>
          What makes it different
        </span>
        <h2 style={{ marginTop: 14, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700 }}>
          Autonomy you can actually audit.
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 22 }}>
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="io"
            data-dir="up"
            style={{
              background: "var(--paper)",
              border: "1.5px solid var(--paper-line)",
              borderRadius: 22,
              padding: "30px 30px 34px",
              boxShadow: "rgba(18,17,42,0.06) 8px 10px",
              transitionDelay: `${i * 0.06}s`,
            }}
          >
            <span style={{ background: f.accent, borderRadius: 8, width: 34, height: 34, display: "block", marginBottom: 20 }} />
            <h3 style={{ marginBottom: 10, fontSize: 20, fontWeight: 600 }}>{f.title}</h3>
            <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6 }}>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}