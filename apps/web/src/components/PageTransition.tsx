"use client";

/**
 * NavigationProgress — a top loading bar that fires on every route change.
 *
 * Strategy: use a guaranteed-duration animation rather than trying to track
 * actual load time. Locally pages are instant, so we always show the bar for
 * a minimum visible duration so the user can actually see it.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Phase = "idle" | "running" | "finishing";

export function NavigationProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [width, setWidth] = useState(0);
  const ids = useRef<ReturnType<typeof setTimeout>[]>([]);

  const flush = () => { ids.current.forEach(clearTimeout); ids.current = []; };

  useEffect(() => {
    flush();

    // Reset, then in the next paint start the sweep
    setWidth(0);
    setPhase("running");

    // Frame 1: jump to 15% immediately so the bar appears
    const t1 = setTimeout(() => setWidth(15), 20);
    // Frame 2: sweep to 80% over ~280ms (eased by CSS transition)
    const t2 = setTimeout(() => setWidth(82), 40);
    // Frame 3: finish to 100%
    const t3 = setTimeout(() => { setWidth(100); setPhase("finishing"); }, 420);
    // Frame 4: hide after fade-out
    const t4 = setTimeout(() => { setPhase("idle"); setWidth(0); }, 720);

    ids.current = [t1, t2, t3, t4];
    return flush;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (phase === "idle") return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        height: 3,
        pointerEvents: "none",
      }}
    >
      {/* Fill bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: `${width}%`,
          background: "linear-gradient(90deg, var(--lime) 0%, var(--peri) 55%, var(--coral) 100%)",
          boxShadow: "0 0 14px var(--lime), 0 0 6px var(--peri)",
          borderRadius: "0 3px 3px 0",
          transition:
            phase === "running"
              ? "width 380ms cubic-bezier(0.1, 0, 0.2, 1)"
              : "width 180ms ease-in, opacity 250ms ease",
          opacity: phase === "finishing" ? 0 : 1,
        }}
      />
      {/* Leading shimmer */}
      {phase === "running" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: `${100 - width}%`,
            width: 80,
            height: "100%",
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
            transform: "translateX(80px)",
            transition: "right 380ms cubic-bezier(0.1, 0, 0.2, 1)",
          }}
        />
      )}
    </div>
  );
}
