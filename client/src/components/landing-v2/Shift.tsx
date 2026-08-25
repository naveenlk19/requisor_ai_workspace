const Shift = () => (
  <section id="shift" className="py-28 md:py-36 bg-foreground text-background relative overflow-hidden">
    <div className="absolute inset-0 opacity-[0.04]" style={{
      backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--background)) 1px, transparent 0)",
      backgroundSize: "32px 32px",
    }} />
    <div className="container max-w-7xl mx-auto relative">
      <div className="max-w-4xl mb-20">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent mb-6">§ The architecture shift</div>
        <h2 className="text-4xl md:text-6xl leading-[1.05] text-balance">
          Product management
          <br />
          is becoming <span className="text-accent">agentic</span>.
        </h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-10 rounded-2xl border border-background/15">
          <div className="font-mono text-xs uppercase tracking-wider text-background/50 mb-4">Pre-agentic era</div>
          <h3 className="text-2xl mb-6 font-medium">The PM is the integration layer.</h3>
          <ul className="space-y-3 text-background/70">
            {["Manual aggregation across 12 tools", "Manual tagging and prioritization", "Manual spec writing", "Productboard, Aha, traditional Jira"].map(t => (
              <li key={t} className="flex gap-3">
                <span className="font-mono text-background/30 mt-0.5">✕</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-10 rounded-2xl bg-accent text-accent-foreground">
          <div className="font-mono text-xs uppercase tracking-wider text-accent-foreground/60 mb-4">Agentic era</div>
          <h3 className="text-2xl mb-6 font-medium">The integration layer is software.</h3>
          <ul className="space-y-3">
            {["Continuous ingestion across every source", "Agents cluster and rank against business goals", "Spec agent drafts PRDs from evidence", "Requisor"].map(t => (
              <li key={t} className="flex gap-3">
                <span className="font-mono mt-0.5">→</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

    </div>
  </section>
);

export default Shift;
