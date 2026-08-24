import mascot from "@/assets/requisor-mascot.png";
import { useAuth } from "@/hooks/useAuth.tsx";
import { useLocation } from "wouter";
import logo from "@assets/Group_185_1764797140461.png";
import davidVideo from "/video/David_Video.mp4";
import "../landing-theme.css";
// logo.dev public token (safe for client use per logo.dev docs)
const LOGO_TOKEN = "pk_X-1ZO13GSgeOoUrIuJ6GMQ";
const logo = (domain: string) => `https://img.logo.dev/${domain}?token=${LOGO_TOKEN}&size=80&format=png`;

type Source = { name: string; domain: string };

// 8 sources placed around the orbit (angle in degrees, 0 = right, clockwise)
const SOURCES: Source[] = [
  { name: "Google Meet", domain: "meet.google.com" },
  { name: "Zoom", domain: "zoom.com" },
  { name: "Teams", domain: "microsoft.com" },
  { name: "Replit", domain: "replit.com" },
  { name: "Lovable", domain: "lovable.dev" },
  { name: "Claude", domain: "claude.ai" },
  { name: "Cursor", domain: "cursor.com" },
];

const CENTER = 250;
const ORBIT_R = 210;
const NODE_R = 26;

const positions = SOURCES.map((s, i) => {
  const angle = (i / SOURCES.length) * Math.PI * 2 - Math.PI / 2;
  return {
    ...s,
    x: CENTER + Math.cos(angle) * ORBIT_R,
    y: CENTER + Math.sin(angle) * ORBIT_R,
    angle,
  };
});

const Hero = () => (
  <section className="relative overflow-hidden">
    <div className="container max-w-7xl mx-auto pt-20 pb-28 md:pt-28 md:pb-36">
      <div className="grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 label-mono mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-deep animate-pulse-dot" />
            New category — Context Hub
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-[5.25rem] leading-[0.98] font-medium text-balance mb-8">
            The Context Hub
            <br />
            for product teams.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-xl text-pretty mb-10 leading-relaxed">
            Unify customer signal across every tool. Run AI agents on top. Ship the right thing, with the receipts.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a
               href="/auth"
              className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-3.5 rounded-full text-sm font-medium hover:bg-foreground/90 transition-all hover:gap-3"
            >
              Get a demo
              <span className="font-mono">→</span>
            </a>
            <a
              href="#flow"
              className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-medium text-foreground hover:text-accent-deep transition-colors"
            >
              See the architecture
              <span className="font-mono text-xs">↓</span>
            </a>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg">
            {[
              { k: "8–12", v: "tools unified" },
              { k: "95%", v: "signal recovered" },
              { k: "1:N", v: "PM to agent ratio" },
            ].map((s) => (
              <div key={s.v}>
                <div className="text-3xl md:text-4xl font-medium tracking-tight">{s.k}</div>
                <div className="label-mono mt-2">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 relative">
          <div className="relative aspect-square max-w-[520px] mx-auto">
            <svg viewBox="0 0 500 500" className="absolute inset-0 w-full h-full">
              <defs>
                <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.45" />
                  <stop offset="60%" stopColor="hsl(var(--accent))" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="flowStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(var(--accent-deep))" stopOpacity="0" />
                  <stop offset="50%" stopColor="hsl(var(--accent-deep))" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="hsl(var(--accent-deep))" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Hub glow */}
              <circle cx={CENTER} cy={CENTER} r="120" fill="url(#hubGlow)" />

              {/* Concentric rings */}
              {[80, 140, 200].map((r) => (
                <circle
                  key={r}
                  cx={CENTER}
                  cy={CENTER}
                  r={r}
                  fill="none"
                  stroke="hsl(var(--accent-deep))"
                  strokeOpacity="0.18"
                  strokeWidth="0.6"
                  strokeDasharray="2 5"
                />
              ))}

              {/* Flow paths from each source to center */}
              {positions.map((p, i) => {
                const pathId = `flow-${i}`;
                // curve via control point offset perpendicular to the line
                const mx = (p.x + CENTER) / 2;
                const my = (p.y + CENTER) / 2;
                const dx = CENTER - p.x;
                const dy = CENTER - p.y;
                const len = Math.hypot(dx, dy);
                const nx = -dy / len;
                const ny = dx / len;
                const curve = 30;
                const cx = mx + nx * curve;
                const cy = my + ny * curve;
                const d = `M ${p.x} ${p.y} Q ${cx} ${cy} ${CENTER} ${CENTER}`;
                return (
                  <g key={p.name}>
                    {/* Static faint path */}
                    <path d={d} fill="none" stroke="hsl(var(--foreground))" strokeOpacity="0.08" strokeWidth="1" />
                    {/* Animated dash overlay */}
                    <path
                      id={pathId}
                      d={d}
                      fill="none"
                      stroke="url(#flowStroke)"
                      strokeWidth="1.5"
                      strokeDasharray="40 160"
                      strokeLinecap="round"
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="200"
                        to="0"
                        dur="3.2s"
                        begin={`${i * 0.4}s`}
                        repeatCount="indefinite"
                      />
                    </path>
                    {/* Traveling data packet */}
                    <circle r="3" fill="hsl(var(--accent-deep))">
                      <animateMotion dur="3.2s" begin={`${i * 0.4}s`} repeatCount="indefinite" path={d} rotate="auto" />
                      <animate
                        attributeName="opacity"
                        values="0;1;1;0"
                        keyTimes="0;0.1;0.85;1"
                        dur="3.2s"
                        begin={`${i * 0.4}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  </g>
                );
              })}
            </svg>

            {/* Source logo nodes (HTML so we can use <img>) */}
            {positions.map((p, i) => (
              <div
                key={p.name}
                className="absolute"
                style={{
                  left: `${(p.x / 500) * 100}%`,
                  top: `${(p.y / 500) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  animation: `float-slow ${6 + (i % 4)}s ease-in-out ${i * 0.3}s infinite`,
                }}
              >
                <div className="group relative">
                  <div
                    className="flex items-center justify-center bg-card border border-border rounded-2xl shadow-[var(--shadow-soft)] backdrop-blur"
                    style={{ width: NODE_R * 2, height: NODE_R * 2 }}
                  >
                    <img
                      src={logo(p.domain)}
                      alt={`${p.name} logo`}
                      width={32}
                      height={32}
                      loading="lazy"
                      className="rounded"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 label-mono text-[10px] whitespace-nowrap opacity-70">
                    {p.name}
                  </div>
                </div>
              </div>
            ))}

            {/* Central mascot (the Hub) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative animate-float-slow">
                <div className="absolute inset-0 rounded-full bg-accent/40 blur-3xl scale-125" />
                <img src={mascot} alt="Requisor mascot" className="relative w-48 md:w-56 drop-shadow-2xl" />
              </div>
            </div>
          </div>
          <div className="mt-6 text-center label-mono">Fig. 01 — Signal flowing into the Hub</div>
        </div>
      </div>
    </div>
  </section>
);

export default Hero;
