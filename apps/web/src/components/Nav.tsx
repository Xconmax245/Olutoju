import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

/**
 * Sticky pill "nav island". The reference's wallet-connect button is
 * deliberately replaced with a "View live guardian" CTA — Olutoju has no
 * per-visitor wallet to connect (Section 6.5 P2).
 */
export function Nav() {
  return (
    <nav
      style={{
        zIndex: 60,
        background: "rgba(243, 240, 250, 0.96)",
        border: "1px solid rgba(18, 17, 42, 0.1)",
        borderRadius: 100,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        maxWidth: 900,
        margin: "18px auto 0",
        padding: "10px 10px 10px 20px",
        position: "sticky",
        top: 18,
        boxShadow: "rgba(18, 17, 42, 0.1) 0px 10px 30px",
      }}
    >
      <Link
        href="/"
        style={{
          fontFamily: "var(--font-display)",
          display: "flex",
          alignItems: "center",
          gap: 9,
          fontSize: 19,
          fontWeight: 700,
        }}
      >
        <Logo />
        olutoju
      </Link>

      <div className="nav-links" style={{ display: "flex", gap: 26, fontSize: 14, fontWeight: 500 }}>
        <a href="#how" style={{ opacity: 0.72 }}>How it works</a>
        <a href="#live" style={{ opacity: 0.72 }}>Live incidents</a>
        <a href="#celo" style={{ opacity: 0.72 }}>Why KeeperHub</a>
      </div>

      <Link
        href="/dashboard"
        style={{
          background: "var(--ink)",
          color: "var(--lime)",
          borderRadius: 100,
          padding: "10px 20px",
          fontSize: 14,
          fontWeight: 600,
        }}
        className="nav-cta"
      >
        View live guardian
      </Link>
    </nav>
  );
}