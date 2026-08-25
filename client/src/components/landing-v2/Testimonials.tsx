import { Lock } from "lucide-react";

export function Testimonials() {
  return (
    <section id="testimonials" className="py-28 md:py-36 relative">
      <div className="container max-w-5xl mx-auto px-4">
        <div className="rounded-3xl border border-border bg-card/40 p-12 md:p-20 text-center">
          <div className="inline-flex items-center gap-2 label-mono mb-8">
            <Lock className="h-3 w-3" />
            Private beta
          </div>
          <h2 className="text-3xl md:text-5xl font-medium mb-6 tracking-tight leading-tight text-balance">
            In private beta with
            <br />
            <span className="text-accent-deep">14 product teams.</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-12 text-pretty">
            YC-backed startups, growth-stage SaaS, and a couple of teams you would
            recognize. Named case studies are under embargo until the public beta opens.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-8 max-w-2xl mx-auto">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/2] rounded-lg bg-muted/50 border border-border/60 flex items-center justify-center grayscale"
                aria-hidden="true"
              >
                <div className="h-2.5 w-2/3 rounded-full bg-foreground/10" />
              </div>
            ))}
          </div>
          <p className="label-mono text-muted-foreground mb-10">
            Design partner logos — to be added before public launch.
          </p>

          <div className="flex flex-wrap gap-3 justify-center">
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
  );
}

export default Testimonials;
