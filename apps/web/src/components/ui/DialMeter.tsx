interface DialMeterProps {
  /** Center readout value, rendered in Space Mono. */
  value: string;
  /** Uppercase label under the readout. */
  unit: string;
  /**
   * Fill fraction 0..1. When omitted the ring plays the ambient fillMeter
   * animation (used for purely decorative/marketing instances).
   */
  fraction?: number;
  size?: number;
  /** Ring stroke color. Defaults to --lime; pass --coral for danger states. */
  strokeColor?: string;
}

const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~552.9

/**
 * The reference's dial-track / dial-fill ring construction. Shared across the
 * hero card, proof block and dashboard so the meter reads identically
 * everywhere. When `fraction` is provided the fill is data-driven; otherwise
 * it runs the ambient sweep animation.
 */
export function DialMeter({
  value,
  unit,
  fraction,
  size = 264,
  strokeColor = "var(--lime)",
}: DialMeterProps) {
  const dataDriven = typeof fraction === "number";
  const clamped = dataDriven ? Math.max(0, Math.min(1, fraction!)) : 0;
  const dashoffset = CIRCUMFERENCE * (1 - clamped);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        aria-hidden="true"
        style={{ display: "block", margin: "0 auto" }}
      >
        <circle
          cx="100"
          cy="100"
          r={RADIUS}
          fill="none"
          stroke="var(--ink-soft)"
          strokeWidth="14"
        />
        <circle
          cx="100"
          cy="100"
          r={RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dataDriven ? dashoffset : CIRCUMFERENCE}
          style={{
            transformOrigin: "50% 50%",
            transform: "rotate(-90deg)",
            transition: dataDriven ? "stroke-dashoffset 1s ease" : undefined,
            animation: dataDriven
              ? undefined
              : "fillMeter 6s ease-in-out infinite",
          }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        <div
          className="mono"
          style={{ color: strokeColor, fontSize: 34, fontWeight: 700 }}
        >
          {value}
        </div>
        <div
          style={{
            color: "var(--muted-on-dark)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            marginTop: 4,
            fontSize: 12,
          }}
        >
          {unit}
        </div>
      </div>
    </div>
  );
}