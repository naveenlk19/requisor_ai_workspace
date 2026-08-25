const stats = [
  { cat: "A · Coverage", k: "73%", v: "of customer feedback never reaches the roadmap in pre-Requisor teams." },
  { cat: "B · Speed", k: "12m", v: "from customer call to drafted PRD with linked evidence." },
  { cat: "C · Traceability", k: "8.4", v: "pieces of source evidence linked to every shipped feature, on average." },
];

const Proof = () => (
  <section className="py-28 md:py-36 bg-card/50 border-y border-border/60">
    <div className="container max-w-7xl mx-auto">
      <div className="label-mono mb-6">§ Proof, in three categories</div>
      <h2 className="text-4xl md:text-5xl leading-tight text-balance max-w-3xl mb-16">
        Coverage, speed, traceability.
      </h2>
      <div className="grid md:grid-cols-3 gap-px bg-border border border-border rounded-2xl overflow-hidden">
        {stats.map((s) => (
          <div key={s.cat} className="bg-background p-10">
            <div className="label-mono mb-8">{s.cat}</div>
            <div className="text-7xl md:text-8xl font-medium tracking-tighter text-accent-deep mb-6">{s.k}</div>
            <p className="text-foreground/85 leading-relaxed text-pretty">{s.v}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 label-mono text-muted-foreground">Across our private beta cohort, Q1 2026.</p>
    </div>
  </section>
);

export default Proof;
