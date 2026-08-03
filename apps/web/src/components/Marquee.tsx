const ITEMS = ["BASE SEPOLIA", "KEEPERHUB", "AAVE", "MCP", "SIMULATED FIRST", "SIGNED ATTESTATIONS"];

/**
 * Full-bleed scrolling ticker of real stack facts. Content is duplicated
 * back-to-back so the CSS translateX(-50%) loop is seamless.
 */
export function Marquee() {
  const run = [...ITEMS, ...ITEMS];
  return (
    <div
      style={{
        background: "var(--ink)",
        borderTop: "1px solid var(--ink-line)",
        borderBottom: "1px solid var(--ink-line)",
        padding: "18px 0",
        overflow: "hidden",
      }}
    >
      <div className="marquee-track" aria-hidden="true">
        {run.map((item, i) => (
          <span
            key={i}
            style={{
              fontFamily: "var(--font-display)",
              color: i % 2 === 1 ? "var(--lime)" : "var(--paper)",
              opacity: i % 2 === 1 ? 1 : 0.9,
              whiteSpace: "nowrap",
              padding: "0 34px",
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            {i % 2 === 1 ? "/" : item}
          </span>
        ))}
      </div>
    </div>
  );
}