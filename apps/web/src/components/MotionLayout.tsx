"use client";

/**
 * MotionLayout — wraps page children and re-mounts on every route change.
 *
 * Using key={pathname} forces React to unmount + remount the div, which
 * replays the CSS animation on every navigation. The div in layout.tsx
 * would never work because it stays mounted — this is the correct pattern.
 */

import { usePathname } from "next/navigation";

export function MotionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      style={{
        animation: "pageEnter 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
