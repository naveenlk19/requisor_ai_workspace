import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth.tsx";
import { useLocation } from "wouter";
import Nav from "@/components/landing-v2/Nav";
import Hero from "@/components/landing-v2/Hero";
import LogoStrip from "@/components/landing-v2/LogoStrip";
import Problem from "@/components/landing-v2/Problem";
import Restate from "@/components/landing-v2/Restate";
import Flow from "@/components/landing-v2/Flow";
import Shift from "@/components/landing-v2/Shift";
import Workflows from "@/components/landing-v2/Workflows";
import Proof from "@/components/landing-v2/Proof";
import Pricing from "@/components/landing-v2/Pricing";
import CTA from "@/components/landing-v2/CTA";
import Footer from "@/components/landing-v2/Footer";
import Why from "@/components/landing-v2/Why";
import Testimonials from "@/components/landing-v2/Testimonials";
import FAQ from "@/components/landing-v2/FAQ";
import FieldKit from "@/components/landing-v2/FieldKit";

export default function LandingV2() {
  useEffect(() => {
    document.title = "Requisor — The Context Hub for product teams";
    const meta =
      document.querySelector('meta[name="description"]') ||
      (() => {
        const m = document.createElement("meta");
        m.setAttribute("name", "description");
        document.head.appendChild(m);
        return m;
      })();
    meta.setAttribute(
      "content",
      "Requisor unifies customer signal across every tool and runs AI agents on top. Grounded product decisions, end-to-end traceability.",
    );
  }, []);

  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
    if (!target) return;
    const href = target.getAttribute("href");
    if (!href) return;
    if (href.startsWith("#") || href.startsWith("/#")) {
      e.preventDefault();
      const hash = href.startsWith("/#") ? href.slice(1) : href;
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", hash);
      }
      return;
    }
    if (
      target.target === "_blank" ||
      href.startsWith("http") ||
      href.startsWith("mailto:")
    ) {
      return;
    }
    if (href.startsWith("/")) {
      e.preventDefault();
      const dest = href === "/auth" && isAuthenticated ? "/dashboard" : href;
      setLocation(dest);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground" onClick={handleClick}>
      <Nav />
      <Hero />
      <Problem />
      <Proof />
      <LogoStrip />
      <Restate />
      <Flow />
      <Workflows />
      <Why />
      <Shift />
      <FieldKit />
      <Testimonials />
      <FAQ />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
}
