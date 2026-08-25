const sources = [
  "GONG", "ZENDESK", "INTERCOM", "SLACK", "JIRA", "LINEAR",
  "NOTION", "HUBSPOT", "SALESFORCE", "PRODUCTBOARD", "FIGMA", "GITHUB",
];

const LogoStrip = () => (
  <section className="border-y border-border/60 bg-card/40 py-8 overflow-hidden">
    <div className="container max-w-7xl mx-auto mb-6 flex items-center justify-between">
      <span className="label-mono">Ingests from the tools you already use</span>
      <span className="label-mono hidden sm:block">12+ native connectors</span>
    </div>
    <div className="relative">
      <div className="flex gap-12 animate-marquee whitespace-nowrap">
        {[...sources, ...sources].map((s, i) => (
          <span key={i} className="font-mono text-sm tracking-[0.2em] text-muted-foreground/70">
            {s}
            <span className="ml-12 text-accent-deep/40">●</span>
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background to-transparent" />
    </div>
  </section>
);

export default LogoStrip;
