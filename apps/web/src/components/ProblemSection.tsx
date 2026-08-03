const CARDS = [
  {
    num: "01",
    title: "Liquidations happen while you sleep",
    body: "Markets move at 3am. By the time a price alert wakes you, the position is already underwater.",
  },
  {
    num: "02",
    title: "Manual defense is too slow",
    body: "Opening a wallet, checking the health factor, and submitting a repay takes minutes you don't have.",
  },
  {
    num: "03",
    title: "You can't verify what a bot did",
    body: "Most automation is a black box. You never see the simulation, the reasoning, or a signed record of the action.",
  },
];

/** Reference scatter-card transforms, reused exactly. */
const REST = [
  "rotate(-1.6deg)",
  "rotate(1.1deg)",
  "rotate(-0.8deg)",
];

export function ProblemSection() {
  return (
    <section
      id="problem"
      style={{ maxWidth: 1200, margin: "0 auto", padding: "120px 32px" }}
    >
      <div className="io" data-dir="up" style={{ maxWidth: 640 }}>
        <span
          className="mono"
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--coral)",
            marginBottom: 16,
            fontSize: 12,
            display: "block",
          }}
        >
          The problem
        </span>
        <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700 }}>
          By the time you notice, it's already gone.
        </h2>
        <p style={{ color: "var(--muted)", marginTop: 18, fontSize: 17, lineHeight: 1.6 }}>
          A DeFi position doesn't wait for you to react. Olutoju closes the
          gap between a threshold breach and a defense — automatically, and with
          a receipt.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26, marginTop: 64 }}>
        {CARDS.map((c, i) => (
          <div
            key={c.num}
            className="io"
            data-dir="up"
            style={{
              background: "var(--paper)",
              border: "1.5px solid var(--paper-line)",
              borderRadius: 22,
              display: "grid",
              gridTemplateColumns: "60px 1fr",
              alignItems: "start",
              gap: 22,
              maxWidth: 640,
              padding: "30px 34px",
              boxShadow: "rgba(18,17,42,0.08) 9px 12px",
              transform: REST[i],
              alignSelf: i === 1 ? "center" : "flex-start",
              marginLeft: i === 1 ? 70 : i === 2 ? 24 : 0,
              transitionDelay: `${i * 0.08}s`,
            }}
          >
            <div className="mono" style={{ color: "var(--peri)", paddingTop: 4, fontSize: 14 }}>
              {c.num}
            </div>
            <div>
              <h3 style={{ marginBottom: 8, fontSize: 21, fontWeight: 600 }}>{c.title}</h3>
              <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6 }}>{c.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}