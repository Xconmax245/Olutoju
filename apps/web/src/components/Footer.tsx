import { Logo } from "@/components/ui/Logo";

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--paper-line)",
        maxWidth: 1200,
        margin: "0 auto",
        padding: "40px 32px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Logo size={28} />
      </div>
      <div style={{ color: "var(--muted)", fontSize: 14 }}>
        A demo guardian for Aave on Base Sepolia · settled via KeeperHub
      </div>
    </footer>
  );
}