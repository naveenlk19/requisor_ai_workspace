const layers = [
  {
    n: "01",
    title: "The shadow IT tax",
    body: "Sales promises a feature on a call. Support files a request. CS forwards a thread. Two engineers ship it in a week. Nobody can find the customer conversation that justified it. That's not product work — it's organizational guesswork at engineering salaries.",
  },
  {
    n: "02",
    title: "The translation tax",
    body: 'Customer said: "I need to see at-risk accounts before my QBR." Jira ticket said: "Add risk indicator to account list." You shipped the second one. They needed the first one. They renewed at half the seats.',
  },
  {
    n: "03",
    title: "The opportunity tax",
    body: "The same feature came up in 9 sales calls last quarter. Nobody connected them. Your deal team thought it was a one-off. You lost $400k in pipeline because the pattern was invisible.",
  },
];

const Problem = () => (
  <section id="problem" className="py-28 md:py-36">
    <div className="container max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-12 gap-12 mb-16">
        <div className="lg:col-span-6">
          <div className="label-mono mb-6">§ The problem</div>
          <h2 className="text-4xl md:text-5xl leading-tight text-balance">
            Code is cheap now.
            <br />
            <span className="text-muted-foreground">Knowing what to build isn't.</span>
          </h2>
        </div>
        <div className="lg:col-span-6 space-y-5 text-lg text-muted-foreground leading-relaxed">
          <p>
            AI coding tools just collapsed the cost of shipping. Engineering can build
            almost anything you ask for, almost as fast as you can spec it. The constraint
            isn't capacity anymore — it's judgment. Are you asking for the right thing?
          </p>
          <p>
            Right now, that decision gets made on the loudest 5% of feedback. The
            screaming customer, the executive escalation, the squeaky sales rep. The other
            95% — sitting in calls, tickets, and Slack threads — never reaches the roadmap.
          </p>
          <p className="text-foreground font-medium">
            So even with AI-fast engineering, you're shipping the wrong things faster.
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

      <div className="mt-10 flex justify-center gap-3 flex-wrap">
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
  </section>
);

export default Problem;
