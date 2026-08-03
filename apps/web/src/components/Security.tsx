const POINTS = [
  { k: "Non-custodial by design", v: "The guardian never holds your funds. It's authorized only to run the specific defensive action you approve." },
  { k: "Simulate-then-sign", v: "Nothing is broadcast until it's proven to help in a fork simulation — malformed or unprofitable actions are dropped." },
  { k: "Verifiable receipts", v: "Every action is signed. The public key is published, so any third party can independently verify an attestation." },
];

export function Security() {
  return (
    <section id="celo" style={{ background: "var(--ink)", padding: "120px 0" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }} className="celo-grid">
        <div className="io" data-dir="left">
          <span className="mono" style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--lime)", fontSize: 12 }}>
            Why KeeperHub
          </span>
          <h2 style={{ color: "var(--paper)", margin: "14px 0 18px", fontSize: "clamp(30px, 3.6vw, 44px)", fontWeight: 700 }}>
            Trust that doesn't ask for trust.
          </h2>
          <p style={{ color: "var(--muted-on-dark)", fontSize: 17, lineHeight: 1.6, maxWidth: 460 }}>
            Olutoju settles through KeeperHub so execution is reliable and
            independent of your wallet — and every step is provable after the
            fact.
          </p>
        </div>
        <div className="io" data-dir="right" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {POINTS.map((p) => (
            <div key={p.k} style={{ background: "var(--ink-card)", border: "1px solid var(--ink-line)", borderRadius: 16, padding: "22px 24px" }}>
              <div style={{ color: "var(--paper)", fontWeight: 600, marginBottom: 6, fontSize: 16 }}>{p.k}</div>
              <div style={{ color: "var(--muted-on-dark)", fontSize: 14.5, lineHeight: 1.55 }}>{p.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}