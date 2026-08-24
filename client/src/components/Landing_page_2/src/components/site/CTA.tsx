import mascot from "@/assets/requisor-mascot.png";

const CTA = () => (
  <section id="cta" className="py-28 md:py-36">
    <div className="container max-w-5xl mx-auto">
      <div className="relative rounded-3xl bg-gradient-to-br from-accent to-accent-deep p-12 md:p-20 overflow-hidden">
        <div className="absolute -right-12 -bottom-12 opacity-90 hidden md:block">
          <img src={mascot} alt="" className="w-72 rotate-6" />
        </div>
        <div className="relative max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent-foreground/70 mb-6">
            § Get on the Hub
          </div>
          <h2 className="text-4xl md:text-6xl leading-[1.02] text-accent-foreground text-balance mb-6 font-medium">
            Code is not the hard part.
            <br />
            Knowing what to build is.
          </h2>
          <p className="text-accent-foreground/80 text-lg max-w-lg mb-10 leading-relaxed">
            See your team's product context unified in 30 minutes. Live walkthrough with a founder.
          </p>
          <div className="flex flex-wrap gap-3">
            <a  href="/auth" className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-3.5 rounded-full text-sm font-medium hover:bg-foreground/90 transition-all">
              Get a demo <span className="font-mono">→</span>
            </a>
            <a href="#" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-medium text-accent-foreground border border-accent-foreground/25 hover:bg-accent-foreground/10 transition-colors">
              Read the architecture post
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default CTA;
