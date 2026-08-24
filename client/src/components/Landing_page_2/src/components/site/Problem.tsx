const layers = [
  {
    n: "01",
    title: "First-order",
    body: "Product teams are drowning in unstructured signal. The average B2B SaaS team generates more feedback in a week than a PM can read in a month.",
  },
  {
    n: "02",
    title: "Second-order",
    body: "Decisions get made on the loudest 5%. The screaming customer, the executive escalation, the squeaky sales rep. The other 95% is wasted.",
  },
  {
    n: "03",
    title: "Third-order",
    body: "Roadmaps drift from customer reality. Engineering ships features nobody asked for. Retention erodes. The board asks why the product is not winning.",
  },
];

const Problem = () => (
  <section className="py-28 md:py-36">
    <div className="container max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-12 gap-12 mb-20">
        <div className="lg:col-span-5">
          <div className="label-mono mb-6">§ The problem, structured</div>
          <h2 className="text-4xl md:text-5xl leading-tight text-balance">
            The root cause is not bad PMs.
            <br />
            <span className="text-muted-foreground">It is missing infrastructure.</span>
          </h2>
        </div>
        <div className="lg:col-span-6 lg:col-start-7 flex items-end">
          <p className="text-lg text-muted-foreground leading-relaxed">
            You cannot reason over data you cannot retrieve. Every other layer of the modern stack solved this years
            ago. Product context is the last unconsolidated data layer in the company.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden border border-border">
        {layers.map((l) => (
          <div key={l.n} className="bg-background p-8 md:p-10">
            <div className="flex items-baseline justify-between mb-6">
              <span className="font-mono text-5xl text-accent-deep">{l.n}</span>
              <span className="label-mono">{l.title}</span>
            </div>
            <p className="text-foreground/85 leading-relaxed text-pretty">{l.body}</p>
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

export default Problem;
