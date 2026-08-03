import { DialMeter } from "@/components/ui/DialMeter";

function MockShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="floaty">
      <div
        style={{
          background: "var(--ink)",
          borderRadius: 22,
          padding: 22,
          boxShadow: "rgba(18,17,42,0.08) 10px 14px",
        }}
      >
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{ background: "var(--ink-line)", borderRadius: "50%", width: 8, height: 8 }}
            />
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

const MOCK_ROW: React.CSSProperties = {
  background: "var(--ink-soft)",
  borderRadius: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 10,
  padding: "12px 16px",
};

export function HowItWorks() {
  return (
    <section id="how" style={{ maxWidth: 1200, margin: "0 auto", padding: "120px 32px" }}>
      <div data-aos="fade-up" style={{ maxWidth: 640 }}>
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
          How it works
        </span>
        <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700 }}>Three simple steps.</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 100, marginTop: 56 }}>
        {/* Step 01 */}
        <div className="step-block" style={stepGrid}>
          <div data-aos="fade-right">
            <div className="mono" style={stepNum}>01</div>
            <h3 style={stepH3}>A position is monitored</h3>
            <p style={stepP}>
              Olutoju polls your Aave position on Base Sepolia every cycle,
              reading the live health factor straight from the chain.
            </p>
          </div>
          <div data-aos="fade-left">
            <MockShell>
              <div style={MOCK_ROW}>
                <span style={{ color: "var(--paper)", fontSize: 14, fontWeight: 500 }}>Aave · WETH/USDC</span>
                <span className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 11 }}>monitored</span>
              </div>
              <div style={MOCK_ROW}>
                <span style={{ color: "var(--paper)", fontSize: 14, fontWeight: 500 }}>Poll interval</span>
                <span className="mono" style={{ color: "var(--lime)", fontSize: 11 }}>live</span>
              </div>
            </MockShell>
          </div>
        </div>

        {/* Step 02 */}
        <div className="step-block" style={stepGrid}>
          <div data-aos="fade-left" style={{ order: -1 }}>
            <div className="mono" style={stepNum}>02</div>
            <h3 style={stepH3}>A threshold is configured</h3>
            <p style={stepP}>
              You set the health factor at which the guardian steps in. Cross it
              and a defense is armed — never before.
            </p>
          </div>
          <div data-aos="fade-right">
            <MockShell>
              <div style={{ color: "var(--paper)", display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13 }}>
                <span>Trigger threshold</span>
                <span className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 11 }}>HF</span>
              </div>
              <div className="mono" style={{ color: "var(--lime)", margin: "6px 0 18px", fontSize: 30, fontWeight: 700 }}>
                1.20
              </div>
              <div style={{ background: "var(--ink-soft)", borderRadius: 100, height: 8, position: "relative" }}>
                <div style={{ background: "var(--peri)", borderRadius: 100, width: "62%", height: "100%", position: "absolute", top: 0, left: 0 }} />
                <div style={{ background: "var(--lime)", border: "3px solid var(--ink)", borderRadius: "50%", width: 18, height: 18, position: "absolute", top: "50%", left: "62%", transform: "translate(-50%, -50%)" }} />
              </div>
            </MockShell>
          </div>
        </div>

        {/* Step 03 */}
        <div className="step-block" style={stepGrid}>
          <div data-aos="fade-right">
            <div className="mono" style={stepNum}>03</div>
            <h3 style={stepH3}>The guardian acts</h3>
            <p style={stepP}>
              The defense is simulated, submitted via KeeperHub, and a signed
              attestation of exactly what happened is recorded.
            </p>
          </div>
          <div data-aos="fade-left">
            <MockShell>
              <span
                className="mono"
                style={{ color: "var(--lime)", background: "var(--lime-bg)", borderRadius: 100, marginBottom: 8, padding: "5px 10px", fontSize: 12, display: "inline-block" }}
              >
                defended
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <DialMeter value="1.84" unit="HF" fraction={0.56} size={80} />
                <div>
                  <div style={{ color: "var(--paper)", fontSize: 14 }}>Repay settled</div>
                  <div className="mono" style={{ color: "var(--muted-on-dark)", fontSize: 11 }}>via KeeperHub</div>
                </div>
              </div>
            </MockShell>
          </div>
        </div>
      </div>
    </section>
  );
}

const stepGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  alignItems: "center",
  gap: 50,
};
const stepNum: React.CSSProperties = { color: "var(--peri)", fontSize: 16, fontWeight: 700 };
const stepH3: React.CSSProperties = { margin: "10px 0 12px", fontSize: 26, fontWeight: 600 };
const stepP: React.CSSProperties = { color: "var(--muted)", maxWidth: 480, fontSize: 16, lineHeight: 1.6 };