interface LogoProps {
  /** When true, the square renders in --paper for use on dark surfaces. */
  onDark?: boolean;
  size?: number;
}

/**
 * Olutoju brand mark — adopts the reference's exact construction, recolored
 * to the Olutoju palette. The square flips to --paper on dark surfaces.
 */
export function Logo({ onDark = false, size = 28 }: LogoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <g transform="rotate(-8 24 24)">
        <rect
          x="6"
          y="6"
          width="36"
          height="36"
          rx="12"
          fill={onDark ? "var(--paper)" : "var(--ink)"}
        />
        <circle cx="24" cy="20" r="9" fill="var(--lime)" />
      </g>
      <circle cx="35" cy="36" r="5.5" fill="var(--coral)" />
    </svg>
  );
}