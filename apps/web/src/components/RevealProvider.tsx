"use client";

import { useEffect } from "react";

/**
 * Hand-rolled scroll-reveal. Watches every `.io` element and adds `.in`
 * when it enters the viewport, driving the CSS transition in globals.css.
 * Replaces AOS entirely — no dependency, cheaper, and matches the reference.
 */
export function RevealProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".io"));

    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  });

  return <>{children}</>;
}