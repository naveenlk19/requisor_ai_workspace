import mascot from "@/assets/requisor-mascot.png";

const Footer = () => (
  <footer className="border-t border-border/60 py-16">
    <div className="container max-w-7xl mx-auto">
      <div className="grid md:grid-cols-12 gap-10 mb-16">
        <div className="md:col-span-5">
          <div className="flex items-center gap-2.5 mb-4">
            <img src={mascot} alt="" className="h-9 w-9 rounded-lg" />
            <span className="text-lg font-medium tracking-tight">Requisor</span>
          </div>
          <p className="text-muted-foreground max-w-sm leading-relaxed">
            The Context Hub and agentic orchestration layer for modern product teams.
          </p>
        </div>
        {[
          { h: "Product", l: ["Context Hub", "Orchestration", "Connectors", "Pricing"] },
          { h: "Resources", l: ["Architecture", "RAG for PMs", "Changelog", "Docs"] },
          { h: "Company", l: ["About", "Manifesto", "Careers", "Contact"] },
        ].map((c) => (
          <div key={c.h} className="md:col-span-2">
            <div className="label-mono mb-4">{c.h}</div>
            <ul className="space-y-2.5 text-sm">
              {c.l.map((i) => (
                <li key={i}><a href="#" className="text-foreground/80 hover:text-accent-deep transition-colors">{i}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 pt-8 border-t border-border/60 label-mono">
        <span>© 2026 Requisor, Inc.</span>
        <span>Snowflake consolidated analytics. Requisor consolidates product context.</span>
      </div>
    </div>
  </footer>
);

export default Footer;
