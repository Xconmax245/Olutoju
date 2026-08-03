import React from "react";

/**
 * Decorative corner bracket rendered as a plain SVG (no animation library).
 * Used as a subtle framing accent; safe to drop anywhere as an absolute child.
 */
export function DecorativeBracket({
  className = "",
  position = "top-right",
}: {
  className?: string;
  position?: "top-right" | "bottom-left";
}) {
  const rotate = position === "bottom-left" ? 180 : 0;
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      style={{ transform: `rotate(${rotate}deg)`, opacity: 0.5 }}
      aria-hidden
    >
      <path
        d="M20 4 H60 V44"
        stroke="var(--coral)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}