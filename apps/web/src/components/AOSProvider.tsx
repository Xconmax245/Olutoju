"use client";

import React from "react";

/**
 * Legacy provider — kept only for backwards compatibility. The app now drives
 * scroll reveals with the `.io` CSS system via RevealProvider; this component
 * no longer pulls in the `aos` library and simply passes children through.
 */
export function AOSProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}