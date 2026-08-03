import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Integrations } from "@/components/Integrations";
import { Marquee } from "@/components/Marquee";
import { ProblemSection } from "@/components/ProblemSection";
import { HowItWorks } from "@/components/HowItWorks";
import { LiveStats } from "@/components/LiveStats";
import { FeaturesGrid } from "@/components/FeaturesGrid";
import { DashboardPreview } from "@/components/DashboardPreview";
import { Security } from "@/components/Security";
import { FAQ } from "@/components/FAQ";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Integrations />
      <Marquee />
      <ProblemSection />
      <HowItWorks />
      <FeaturesGrid />
      <LiveStats />

      {/* Dashboard Preview Section */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "120px 32px" }}>
        <div className="io" data-dir="up" style={{ textAlign: "center", marginBottom: 56 }}>
          <span className="mono" style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--coral)", fontSize: 12 }}>
            See it in action
          </span>
          <h2 style={{ marginTop: 14, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700 }}>
            The guardian, live.
          </h2>
          <p style={{ color: "var(--muted)", maxWidth: 520, margin: "18px auto 0", fontSize: 17, lineHeight: 1.6 }}>
            Real-time visibility into your monitored positions, active threats,
            and cryptographically verified resolutions.
          </p>
        </div>
        <div className="io" data-dir="up">
          <DashboardPreview />
        </div>
      </section>

      <Security />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}