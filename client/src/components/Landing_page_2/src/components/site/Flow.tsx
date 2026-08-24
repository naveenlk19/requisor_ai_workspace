const steps = [
  { word: "Ingest", body: "Connect 12+ sources. Continuous, deduped, normalized." },
  { word: "Ground", body: "Embed and structure into the product context graph." },
  { word: "Retrieve", body: "Hybrid search returns evidence with citations." },
  { word: "Orchestrate", body: "Agents draft, prioritize, spec, and link to source." },
];

const Flow = () => (
  <section id="flow" className="py-28 md:py-36">
    <div className="container max-w-7xl mx-auto">
      <div className="flex items-end justify-between mb-16 flex-wrap gap-6">
        <div>
          <div className="label-mono mb-6">§ How it works</div>
          <h2 className="text-4xl md:text-5xl leading-tight text-balance max-w-2xl">
            Ingest. Ground. Retrieve. Orchestrate.
          </h2>
        </div>
        <span className="label-mono">A four-stage pipeline</span>
      </div>

      <div className="relative grid md:grid-cols-4 gap-px bg-border border border-border rounded-2xl overflow-hidden">
        {steps.map((s, i) => (
          <div key={s.word} className="bg-background p-8 md:p-10 relative">
            <div className="flex items-baseline gap-3 mb-6">
              <span className="font-mono text-xs text-accent-deep">0{i + 1}</span>
              <span className="h-px flex-1 hairline" />
            </div>
            <h3 className="text-3xl md:text-4xl font-medium tracking-tight mb-4">{s.word}</h3>
            <p className="text-muted-foreground leading-relaxed">{s.body}</p>
            {i < steps.length - 1 && (
              <span className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 font-mono text-accent-deep z-10 bg-background px-1">
                →
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
    <div className="mt-10 flex justify-center">
      <a
         href="/auth"
        className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-3.5 rounded-full text-sm font-medium hover:bg-foreground/90 transition-all hover:gap-3"
      >
        Get a demo
        <span className="font-mono">→</span>
      </a>
    </div>
  </section>
);

export default Flow;
