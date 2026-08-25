const layers = [
  {
    label: "L4 · Action",
    name: "Agentic Orchestration",
    desc: "A graph of specialized agents. Research, prioritization, spec, traceability. You define outcomes, the controller routes work.",
    tags: ["multi-agent", "evals", "controllers"],
  },
  {
    label: "L3 · Reasoning",
    name: "Product Context Graph",
    desc: "Features, customers, requests, outcomes — structured into a queryable graph with first-class relationships.",
    tags: ["graph", "embeddings", "schemas"],
  },
  {
    label: "L2 · Retrieval",
    name: "Grounded Index",
    desc: "Vector + lexical retrieval over the full corpus. Every answer cites its source. RAG, productized for PMs.",
    tags: ["RAG", "hybrid search", "citations"],
  },
  {
    label: "L1 · Ingest",
    name: "Customer Signal Ingestion",
    desc: "Native connectors to Meet, Zoom, Teams, Slack, Jira, HubSpot and more. Continuous, deduped, normalized.",
    tags: ["connectors", "ETL", "dedup"],
  },
];

const Hub = () => (
  <section id="hub" className="py-28 md:py-36 bg-card/50 border-y border-border/60">
    <div className="container max-w-7xl mx-auto">
      <div className="max-w-3xl mb-20">
        <div className="label-mono mb-6">§ The Context Hub, layer by layer</div>
        <h2 className="text-4xl md:text-5xl leading-tight text-balance mb-6">A new layer in the product stack.</h2>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Built on the same architectural pattern as modern AI infrastructure: ingest, ground, retrieve, act. Not a
          wrapper on a single GPT call.
        </p>
      </div>

      <div className="space-y-3">
        {layers.map((l, i) => (
          <div
            key={l.name}
            className="group grid grid-cols-12 gap-6 items-start p-6 md:p-8 bg-background rounded-2xl border border-border hover:border-accent-deep/40 hover:shadow-[var(--shadow-soft)] transition-all"
          >
            <div className="col-span-12 md:col-span-2">
              <div className="font-mono text-xs text-accent-deep tracking-wider">{l.label}</div>
            </div>
            <div className="col-span-12 md:col-span-4">
              <h3 className="text-2xl font-medium tracking-tight">{l.name}</h3>
            </div>
            <div className="col-span-12 md:col-span-4">
              <p className="text-muted-foreground leading-relaxed text-pretty">{l.desc}</p>
            </div>
            <div className="col-span-12 md:col-span-2 flex md:justify-end flex-wrap gap-1.5">
              {l.tags.map((t) => (
                <span
                  key={t}
                  className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-accent-soft text-accent-deep"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Hub;
