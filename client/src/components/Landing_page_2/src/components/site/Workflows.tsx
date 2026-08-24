import { Link } from "react-router-dom";

const flows = [
  {
    slug: "discovery",
    tag: "Discovery",
    title: "Customer call → drafted PRD",
    metric: "12 min",
    body: "Gong transcript ingests. Research agent clusters the asks. Spec agent drafts a PRD with citations to every supporting moment.",
  },
  {
    slug: "prioritization",
    tag: "Prioritization",
    title: "Quarterly planning, evidence-grounded",
    metric: "0 spreadsheets",
    body: "Prioritization agent ranks open requests against revenue impact, churn risk, and stated business goals. Output is auditable.",
  },
  {
    slug: "traceability",
    tag: "Traceability",
    title: "Every Jira ticket, linked back",
    metric: "100% coverage",
    body: "Traceability agent maintains the chain from shipped feature → spec → cluster → original customer signal. Board-ready.",
  },
  {
    slug: "triage",
    tag: "Triage",
    title: "Support tickets become product signal",
    metric: "Continuous",
    body: "Zendesk and Intercom stream into the hub. Themes surface automatically. Nothing is lost in the long tail.",
  },
];

const Workflows = () => (
  <section id="workflows" className="py-28 md:py-36">
    <div className="container max-w-7xl mx-auto">
      <div className="max-w-3xl mb-16">
        <div className="label-mono mb-6">§ Workflows you can replace today</div>
        <h2 className="text-4xl md:text-5xl leading-tight text-balance">Stop being the human ETL.</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {flows.map((f) => (
          <Link
            key={f.slug}
            to={`/workflows/${f.slug}`}
            className="group p-8 md:p-10 bg-card rounded-2xl border border-border hover:border-accent-deep/50 transition-all hover:-translate-y-0.5 block"
          >
            <div className="flex items-center justify-between mb-8">
              <span className="label-mono">{f.tag}</span>
              <span className="font-mono text-sm text-accent-deep">{f.metric}</span>
            </div>
            <h3 className="text-2xl md:text-3xl font-medium tracking-tight mb-4 text-balance">{f.title}</h3>
            <p className="text-muted-foreground leading-relaxed">{f.body}</p>
            <div className="mt-8 flex items-center gap-2 text-sm text-foreground/60 group-hover:text-accent-deep transition-colors">
              <span className="font-mono text-xs">→</span>
              <span>See workflow</span>
            </div>
          </Link>
        ))}
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
    </div>
  </section>
);

export default Workflows;
