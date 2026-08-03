const QA = [
  {
    q: "Does Olutoju hold my funds?",
    a: "No. It's non-custodial — the guardian is only authorized to run the specific defensive action you approve, and never takes custody of assets.",
  },
  {
    q: "What chain does it run on?",
    a: "The demo monitors an Aave position on Base Sepolia and settles defensive transactions through KeeperHub.",
  },
  {
    q: "What happens if a defense would fail?",
    a: "Every action is simulated against a fork first. If it wouldn't improve the position, it's dropped before anything is broadcast on-chain.",
  },
  {
    q: "How can I verify what the guardian did?",
    a: "Each incident produces a signed attestation containing the trigger, simulation result, transaction hash, and final state. The verifier public key is published so anyone can check it.",
  },
];

export function FAQ() {
  return (
    <section style={{ maxWidth: 820, margin: "0 auto", padding: "120px 32px" }}>
      <div className="io" data-dir="up" style={{ marginBottom: 48 }}>
        <span className="mono" style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--coral)", fontSize: 12 }}>
          FAQ
        </span>
        <h2 style={{ marginTop: 14, fontSize: "clamp(30px, 3.6vw, 44px)", fontWeight: 700 }}>
          Questions, answered.
        </h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {QA.map((item, i) => (
          <details
            key={i}
            className="io faq-item"
            data-dir="up"
            style={{
              background: "var(--paper)",
              border: "1.5px solid var(--paper-line)",
              borderRadius: 16,
              padding: "20px 24px",
              transitionDelay: `${i * 0.05}s`,
            }}
          >
            <summary style={{ cursor: "pointer", listStyle: "none", fontSize: 17, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              {item.q}
              <span className="mono" style={{ color: "var(--coral)", fontSize: 20 }}>+</span>
            </summary>
            <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 15.5, lineHeight: 1.6 }}>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}