import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth.tsx";
import { useLocation } from "wouter";
import Nav from "@/components/landing-v2/Nav";
import Hub from "@/components/landing-v2/Hub";
import Footer from "@/components/landing-v2/Footer";

export default function ArchitecturePage() {
  useEffect(() => {
    document.title = "Architecture — Requisor";
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
      "The four-layer architecture behind Requisor's Context Hub — ingest, retrieve, reason, act.",
    );
  }, []);

  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
    if (!target) return;
    const href = target.getAttribute("href");
    if (!href) return;
    if (href.startsWith("#")) {
      e.preventDefault();
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
      <section className="pt-20 pb-12 md:pt-28 md:pb-16">
        <div className="container max-w-7xl mx-auto">
          <a
            href="/"
            className="label-mono inline-flex items-center gap-2 mb-8 hover:text-accent-deep transition-colors"
          >
            <span className="font-mono">←</span> Back to home
          </a>
          <div className="max-w-3xl">
            <div className="label-mono mb-6">§ Architecture</div>
            <h1 className="text-5xl md:text-7xl leading-[0.98] font-medium text-balance mb-8">
              The Requisor
              <br />
              architecture.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed text-pretty">
              Four layers, built on the same architectural pattern as modern AI
              infrastructure: ingest, retrieve, reason, act. Each layer is
              independently inspectable and replaceable. Read top-down — every
              layer above depends on the one below.
            </p>
          </div>
        </div>
      </section>
      <Hub />
      <section className="py-20 md:py-28">
        <div className="container max-w-5xl mx-auto">
          <div className="rounded-3xl border border-border p-10 md:p-14 bg-card/40">
            <div className="label-mono mb-4">§ Why this matters</div>
            <h2 className="text-3xl md:text-4xl leading-tight text-balance mb-6">
              Wrapper apps die when the model changes.
              <br />
              <span className="text-muted-foreground">Context layers compound.</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed text-lg">
              Every layer in this stack is a moat. The ingestion connectors are
              an integration moat. The context graph is a data moat. The
              retrieval index is a recall moat. The agent controller is an
              orchestration moat. Together they form what a single GPT call
              cannot: a system that gets sharper the more your team uses it.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <a
                href="/auth"
                className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-3.5 rounded-full text-sm font-medium hover:bg-foreground/90 transition-all hover:gap-3"
              >
                Start free
                <span className="font-mono">→</span>
              </a>
              <a
                href="https://calendly.com/requisor" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-medium text-foreground border border-border hover:border-accent-deep hover:text-accent-deep transition-colors"
              >
                Talk to founder
                <span className="font-mono">→</span>
              </a>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
