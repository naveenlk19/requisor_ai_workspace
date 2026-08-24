import { Link, useParams, Navigate } from "react-router-dom";
import { useEffect, useMemo } from "react";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import {
  WORKFLOWS,
  DISCOVERY_SIGNALS,
  DISCOVERY_CLUSTERS,
  DISCOVERY_SPEC,
  RANKED_ITEMS,
  TRACE_FEATURE,
  TRACE_CHAIN,
  TRACE_RECEIPTS,
  TRIAGE_ITEMS,
  TRIAGE_THEMES,
  type Signal,
  type SignalSource,
} from "@/data/workflows";

const LOGO_TOKEN = "pk_X-1ZO13GSgeOoUrIuJ6GMQ";
const DOMAIN: Record<SignalSource, string> = {
  Gong: "gong.io",
  Zendesk: "zendesk.com",
  Intercom: "intercom.com",
  Slack: "slack.com",
  Jira: "atlassian.com",
  HubSpot: "hubspot.com",
  Linear: "linear.app",
  Notion: "notion.so",
};
const logoFor = (s: SignalSource) =>
  `https://img.logo.dev/${DOMAIN[s]}?token=${LOGO_TOKEN}&size=64&format=png`;

const SourceChip = ({ source }: { source: SignalSource }) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border border-border text-xs font-mono">
    <img src={logoFor(source)} alt={source} className="h-3.5 w-3.5 rounded-sm" />
    {source}
  </span>
);

const sentimentClass = (s: Signal["sentiment"]) =>
  ({
    blocker: "text-destructive border-destructive/30 bg-destructive/5",
    negative: "text-destructive/80 border-destructive/20 bg-destructive/5",
    neutral: "text-muted-foreground border-border bg-card",
    positive: "text-accent-deep border-accent-deep/30 bg-accent/10",
  }[s]);

// ─── Discovery ─────────────────────────────────────────────────
const DiscoveryView = () => (
  <div className="grid lg:grid-cols-12 gap-px bg-border border border-border rounded-2xl overflow-hidden">
    {/* Signals */}
    <div className="lg:col-span-5 bg-background p-8">
      <div className="flex items-center justify-between mb-6">
        <span className="label-mono">§ Raw signals · 7 of 28</span>
        <span className="font-mono text-xs text-accent-deep">live</span>
      </div>
      <div className="space-y-3">
        {DISCOVERY_SIGNALS.map((s) => (
          <article key={s.id} className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <SourceChip source={s.source} />
                <span className="font-mono text-xs text-muted-foreground">{s.id}</span>
              </div>
              <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${sentimentClass(s.sentiment)}`}>
                {s.sentiment}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90 mb-2">"{s.excerpt}"</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
              <span>{s.account}</span>
              <span>· {s.arr} ARR</span>
              {s.speaker && <span>· {s.speaker}</span>}
              <span className="ml-auto">{s.timestamp}</span>
            </div>
          </article>
        ))}
      </div>
    </div>

    {/* Clusters */}
    <div className="lg:col-span-3 bg-background p-8">
      <div className="label-mono mb-6">§ Clusters</div>
      <div className="space-y-3">
        {DISCOVERY_CLUSTERS.map((c) => (
          <div key={c.id} className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-xs text-accent-deep">{c.id}</span>
              <span className="font-mono text-xs">{c.signalCount} signals</span>
            </div>
            <h4 className="text-base font-medium mb-3 leading-snug">{c.theme}</h4>
            <div className="text-2xl font-medium tracking-tight text-accent-deep mb-2">{c.arrImpacted}</div>
            <div className="text-xs text-muted-foreground">{c.accounts.join(", ")}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Spec */}
    <div className="lg:col-span-4 bg-background p-8">
      <div className="flex items-center justify-between mb-6">
        <span className="label-mono">§ Drafted PRD</span>
        <span className="font-mono text-xs text-accent-deep">v0.3 · auto</span>
      </div>
      <div className="p-5 rounded-lg border border-border bg-card">
        <div className="font-mono text-xs text-muted-foreground mb-1">PRD-088</div>
        <h4 className="text-xl font-medium tracking-tight mb-5">Scheduled Exports</h4>
        <div className="space-y-5">
          {DISCOVERY_SPEC.map((b) => (
            <div key={b.heading}>
              <div className="label-mono mb-2">{b.heading}</div>
              <p className="text-sm leading-relaxed text-foreground/85 mb-2">{b.body}</p>
              <div className="flex flex-wrap gap-1">
                {b.citations.map((id) => (
                  <span key={id} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent-deep border border-accent-deep/20">
                    {id}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// ─── Prioritization ────────────────────────────────────────────
const statusColor = (s: string) =>
  s === "Now" ? "bg-accent-deep text-background" :
  s === "Next" ? "bg-accent/30 text-accent-deep" :
  "bg-muted text-muted-foreground";
const churnColor = (r: string) =>
  r === "High" ? "text-destructive" : r === "Medium" ? "text-foreground/70" : "text-muted-foreground";

const PrioritizationView = () => (
  <div className="space-y-6">
    <div className="grid md:grid-cols-4 gap-px bg-border border border-border rounded-2xl overflow-hidden">
      {[
        { k: "$5.4M", v: "ARR weighted across the queue" },
        { k: "8", v: "Initiatives ranked this quarter" },
        { k: "3", v: "Promoted to Now" },
        { k: "94%", v: "Items with ≥3 evidence sources" },
      ].map((s) => (
        <div key={s.k} className="bg-background p-6">
          <div className="text-3xl font-medium tracking-tight text-accent-deep mb-2">{s.k}</div>
          <div className="text-xs text-muted-foreground leading-relaxed">{s.v}</div>
        </div>
      ))}
    </div>

    <div className="border border-border rounded-2xl overflow-hidden bg-background">
      <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-border bg-card label-mono">
        <div className="col-span-1">#</div>
        <div className="col-span-4">Initiative</div>
        <div className="col-span-1 text-right">RICE</div>
        <div className="col-span-2 text-right">ARR impact</div>
        <div className="col-span-1 text-right">Churn</div>
        <div className="col-span-2">Goal</div>
        <div className="col-span-1 text-right">Status</div>
      </div>
      {RANKED_ITEMS.map((r) => (
        <div key={r.rank} className="grid grid-cols-12 gap-4 px-6 py-5 border-b border-border last:border-0 items-center hover:bg-card/60 transition-colors">
          <div className="col-span-1 font-mono text-sm text-muted-foreground">{String(r.rank).padStart(2, "0")}</div>
          <div className="col-span-4">
            <div className="font-medium text-base mb-1">{r.title}</div>
            <div className="text-xs text-muted-foreground font-mono">
              R {r.rice.reach} · I {r.rice.impact} · C {Math.round(r.rice.confidence * 100)}% · E {r.rice.effort} · {r.evidence} signals
            </div>
          </div>
          <div className="col-span-1 text-right font-mono text-base text-accent-deep">{r.rice.score}</div>
          <div className="col-span-2 text-right font-medium">{r.arr}</div>
          <div className={`col-span-1 text-right font-mono text-sm ${churnColor(r.churnRisk)}`}>{r.churnRisk}</div>
          <div className="col-span-2 text-xs text-muted-foreground">{r.goalAlignment}</div>
          <div className="col-span-1 text-right">
            <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded ${statusColor(r.status)}`}>{r.status}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Traceability ──────────────────────────────────────────────
const TraceabilityView = () => (
  <div className="space-y-6">
    <div className="p-8 rounded-2xl border border-border bg-card">
      <div className="flex items-start justify-between flex-wrap gap-6">
        <div>
          <span className="label-mono">§ Shipped feature</span>
          <h3 className="text-3xl md:text-4xl font-medium tracking-tight mt-3 mb-2">{TRACE_FEATURE.name}</h3>
          <div className="text-sm text-muted-foreground font-mono">{TRACE_FEATURE.jira} · {TRACE_FEATURE.shipped} · {TRACE_FEATURE.owner}</div>
        </div>
        <div className="text-right">
          <div className="label-mono mb-2">ARR attributed</div>
          <div className="text-2xl font-medium tracking-tight text-accent-deep">{TRACE_FEATURE.arrAttributed}</div>
        </div>
      </div>
    </div>

    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 p-8 rounded-2xl border border-border bg-background">
        <div className="label-mono mb-8">§ Provenance chain · feature → signal</div>
        <ol className="relative">
          {TRACE_CHAIN.map((n, i) => (
            <li key={n.id} className="relative pl-10 pb-8 last:pb-0">
              <span className="absolute left-0 top-1 w-7 h-7 rounded-full border-2 border-accent-deep bg-background flex items-center justify-center font-mono text-[10px] text-accent-deep">
                {String(i + 1).padStart(2, "0")}
              </span>
              {i < TRACE_CHAIN.length - 1 && (
                <span className="absolute left-[13px] top-9 bottom-0 w-px bg-border" />
              )}
              <div className="flex items-center gap-2 mb-1">
                <span className="label-mono">{n.layer}</span>
                <span className="font-mono text-xs text-accent-deep">{n.id}</span>
                {n.source && <SourceChip source={n.source} />}
              </div>
              <div className="text-lg font-medium tracking-tight">{n.label}</div>
              <div className="text-sm text-muted-foreground font-mono mt-1">{n.meta}</div>
            </li>
          ))}
        </ol>
      </div>

      <div className="p-8 rounded-2xl border border-border bg-background">
        <div className="label-mono mb-8">§ Receipts</div>
        <div className="space-y-5">
          {TRACE_RECEIPTS.map((r) => (
            <div key={r.account} className="pb-5 border-b border-border last:border-0 last:pb-0">
              <div className="font-medium mb-1">{r.account}</div>
              <div className="text-sm text-accent-deep mb-1">{r.outcome}</div>
              <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                <span>{r.arr}</span>
                <span>{r.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// ─── Triage ────────────────────────────────────────────────────
const trendColor = (n: number) =>
  n > 10 ? "text-destructive" : n < 0 ? "text-accent-deep" : "text-muted-foreground";
const triageStatusColor = (s: string) =>
  s === "New theme" ? "bg-accent/30 text-accent-deep" :
  s === "Growing" ? "bg-destructive/10 text-destructive" :
  s === "Resolved" ? "bg-muted text-muted-foreground" :
  "bg-card text-foreground/70 border border-border";

const TriageView = () => (
  <div className="space-y-6">
    <div className="grid md:grid-cols-5 gap-px bg-border border border-border rounded-2xl overflow-hidden">
      {TRIAGE_THEMES.map((t) => (
        <div key={t.theme} className="bg-background p-6">
          <div className="label-mono mb-3 line-clamp-2 min-h-[2.5rem]">{t.theme}</div>
          <div className="text-3xl font-medium tracking-tight text-accent-deep mb-1">{t.count}</div>
          <div className="text-xs text-muted-foreground mb-3">{t.accounts} accounts</div>
          <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-card border border-border">{t.status}</span>
        </div>
      ))}
    </div>

    <div className="border border-border rounded-2xl overflow-hidden bg-background">
      <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-border bg-card label-mono">
        <div className="col-span-2">Source</div>
        <div className="col-span-2">Customer</div>
        <div className="col-span-3">Theme</div>
        <div className="col-span-1 text-right">#</div>
        <div className="col-span-1 text-right">WoW</div>
        <div className="col-span-2">First seen</div>
        <div className="col-span-1 text-right">Status</div>
      </div>
      {TRIAGE_ITEMS.map((t) => (
        <div key={t.id} className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-border last:border-0 items-center hover:bg-card/60 transition-colors">
          <div className="col-span-2 flex items-center gap-2">
            <SourceChip source={t.source} />
            <span className="font-mono text-xs text-muted-foreground">{t.ticket}</span>
          </div>
          <div className="col-span-2 text-sm">{t.customer}</div>
          <div className="col-span-3 text-sm">{t.theme}</div>
          <div className="col-span-1 text-right font-mono">{t.occurrences}</div>
          <div className={`col-span-1 text-right font-mono text-sm ${trendColor(t.trend)}`}>
            {t.trend > 0 ? "+" : ""}{t.trend}%
          </div>
          <div className="col-span-2 text-xs text-muted-foreground font-mono">{t.firstSeen}</div>
          <div className="col-span-1 text-right">
            <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded ${triageStatusColor(t.status)}`}>{t.status}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Page shell ────────────────────────────────────────────────
const Workflow = () => {
  const { slug } = useParams();
  const wf = useMemo(() => (slug ? WORKFLOWS[slug] : undefined), [slug]);

  useEffect(() => {
    if (!wf) return;
    document.title = `${wf.title} — Requisor`;
    const meta =
      document.querySelector('meta[name="description"]') ||
      (() => {
        const m = document.createElement("meta");
        m.setAttribute("name", "description");
        document.head.appendChild(m);
        return m;
      })();
    meta.setAttribute("content", wf.intro);
  }, [wf]);

  if (!wf) return <Navigate to="/" replace />;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Nav />
      <section className="pt-32 pb-12 md:pt-40 md:pb-16">
        <div className="container max-w-7xl mx-auto">
          <Link to="/#workflows" className="label-mono inline-flex items-center gap-2 mb-10 hover:text-accent-deep transition-colors">
            ← All workflows
          </Link>
          <div className="grid md:grid-cols-12 gap-10 items-end">
            <div className="md:col-span-8">
              <div className="label-mono mb-6">§ {wf.tag}</div>
              <h1 className="text-5xl md:text-6xl leading-[1.05] tracking-tight text-balance mb-6">{wf.title}</h1>
              <p className="text-lg text-muted-foreground leading-relaxed text-pretty max-w-2xl">{wf.intro}</p>
            </div>
            <div className="md:col-span-4 md:text-right">
              <div className="text-6xl md:text-7xl font-medium tracking-tighter text-accent-deep mb-2">{wf.metric}</div>
              <div className="label-mono">{wf.metricLabel}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-28 md:pb-36">
        <div className="container max-w-7xl mx-auto">
          {wf.kind === "discovery" && <DiscoveryView />}
          {wf.kind === "prioritization" && <PrioritizationView />}
          {wf.kind === "traceability" && <TraceabilityView />}
          {wf.kind === "triage" && <TriageView />}
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default Workflow;
