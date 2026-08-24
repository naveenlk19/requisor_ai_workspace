import { useEffect, useRef, useState } from "react";

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setRevealed(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, revealed };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(mq.matches);
    handler();
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

function useRecTimer(active: boolean) {
  const [seconds, setSeconds] = useState(42);
  useEffect(() => {
    if (!active) return;
    setSeconds(42);
    const id = window.setInterval(() => {
      setSeconds((s) => (s >= 3599 ? 42 : s + 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function Clip({ revealed, animate }: { revealed: boolean; animate: boolean }) {
  const timer = useRecTimer(revealed && animate);
  return (
    <div className="relative w-full max-w-[280px] mx-auto" aria-hidden="true">
      {/* Floor reflection */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -bottom-10 w-[78%] h-10 rounded-[50%] blur-2xl opacity-60"
        style={{ background: "radial-gradient(ellipse at center, rgba(80,200,255,0.18), transparent 70%)" }}
      />
      <div
        className="relative aspect-[3/5] rounded-[2.2rem] p-[2px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
        style={{
          background:
            "linear-gradient(160deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 40%, rgba(0,0,0,0.4) 100%)",
        }}
      >
        <div
          className="relative w-full h-full rounded-[2.1rem] overflow-hidden"
          style={{
            background:
              "linear-gradient(165deg, #2a2f36 0%, #14171b 50%, #0a0c0f 100%)",
          }}
        >
          {/* Specular sheen */}
          <div
            className="absolute inset-0 pointer-events-none opacity-70 mix-blend-screen"
            style={{
              background:
                "linear-gradient(125deg, transparent 30%, rgba(255,255,255,0.18) 45%, rgba(255,255,255,0.04) 55%, transparent 70%)",
            }}
          />
          {/* Top edge highlight */}
          <div
            className="absolute inset-x-6 top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)" }}
          />
          {/* Side record button */}
          <div className="absolute -right-[3px] top-[26%] h-10 w-[6px] rounded-r bg-gradient-to-b from-zinc-400 via-zinc-600 to-zinc-800 shadow-inner" />
          {/* Bottom port */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-black/70 border-t border-white/5" />

          {/* Screen */}
          <div className="absolute inset-x-5 top-5 bottom-16 rounded-2xl p-[1.5px] bg-gradient-to-b from-white/15 via-white/5 to-white/0">
            <div
              className="relative h-full w-full rounded-2xl overflow-hidden"
              style={{
                background:
                  "radial-gradient(120% 80% at 50% 0%, #0c2a1a 0%, #061711 55%, #02080a 100%)",
              }}
            >
              {/* Screen gloss */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(160deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 35%)",
                }}
              />
              <div className="relative h-full w-full flex flex-col items-center justify-center text-emerald-300 font-mono">
                <div className="flex items-center gap-2 text-xs tracking-[0.3em]">
                  <span
                    className={`h-2 w-2 rounded-full bg-rose-500 ${revealed && animate ? "animate-pulse" : ""}`}
                    style={{ boxShadow: "0 0 10px rgba(244,63,94,0.9)" }}
                  />
                  REC
                </div>
                <div className="mt-2 text-2xl tracking-widest tabular-nums text-emerald-200 drop-shadow-[0_0_8px_rgba(110,231,183,0.35)]">
                  {timer}
                </div>
                <div className="mt-3 text-[10px] tracking-[0.25em] text-emerald-400/60">REC001</div>
              </div>
            </div>
          </div>

          {/* Brand mark */}
          <div className="absolute bottom-7 left-1/2 -translate-x-1/2 text-[9px] font-mono tracking-[0.3em] text-white/30">
            REQUISOR.
          </div>
        </div>
      </div>
    </div>
  );
}

function Puck({ revealed, animate }: { revealed: boolean; animate: boolean }) {
  return (
    <div className="relative w-full max-w-[280px] mx-auto" aria-hidden="true">
      {/* Floor reflection */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -bottom-10 w-[78%] h-10 rounded-[50%] blur-2xl opacity-60"
        style={{ background: "radial-gradient(ellipse at center, rgba(244,114,182,0.16), transparent 70%)" }}
      />
      <div
        className="relative aspect-square rounded-full p-[2px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
        style={{
          background:
            "linear-gradient(160deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 40%, rgba(0,0,0,0.45) 100%)",
        }}
      >
        <div
          className="relative w-full h-full rounded-full overflow-hidden"
          style={{
            background:
              "radial-gradient(120% 120% at 30% 25%, #3a3f47 0%, #1a1d22 45%, #07090b 100%)",
          }}
        >
          {/* Specular highlight */}
          <div
            className="absolute -top-6 -left-6 w-2/3 h-2/3 rounded-full opacity-60 blur-2xl"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.05) 60%, transparent 75%)",
            }}
          />
          {/* Side slider switch */}
          <div className="absolute right-[8%] top-1/2 -translate-y-1/2 w-1 h-16 rounded-full bg-gradient-to-b from-zinc-300/80 via-zinc-500/80 to-zinc-700/80 shadow-inner" />
          {/* Switch position labels */}
          <div className="absolute right-[14%] top-1/2 -translate-y-1/2 flex flex-col gap-2 text-[7px] font-mono tracking-[0.2em] text-white/30">
            <span>ON</span>
            <span>OFF</span>
            <span>RST</span>
          </div>
          {/* Top LED */}
          <div className="absolute top-[18%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${revealed && animate ? "animate-pulse" : ""}`}
              style={{
                background:
                  "radial-gradient(circle at 35% 35%, #fda4af 0%, #f43f5e 60%, #881337 100%)",
                boxShadow: "0 0 14px rgba(244,63,94,0.7), inset 0 0 4px rgba(255,255,255,0.6)",
              }}
            />
          </div>
          {/* Brand mark */}
          <div className="absolute bottom-[22%] left-1/2 -translate-x-1/2 text-[9px] font-mono tracking-[0.3em] text-white/30">
            REQUISOR.
          </div>
          {/* Mic mesh dots */}
          <div className="absolute bottom-[34%] left-1/2 -translate-x-1/2 flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className="h-1 w-1 rounded-full bg-black/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const Spec = ({ k, v }: { k: string; v: string }) => (
  <li className="flex items-baseline justify-between gap-4 border-b border-white/10 py-2.5">
    <span className="label-mono text-white/50">{k}</span>
    <span className="text-sm text-white/85 text-right">{v}</span>
  </li>
);

export default function FieldKit() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const animate = !reduced;

  const baseStyle = (delayMs: number): React.CSSProperties =>
    animate
      ? {
          opacity: revealed ? 1 : 0,
          transform: revealed ? "translateY(0) scale(1)" : "translateY(28px) scale(0.96)",
          transition: `opacity 900ms cubic-bezier(.2,.7,.2,1) ${delayMs}ms, transform 900ms cubic-bezier(.2,.7,.2,1) ${delayMs}ms`,
        }
      : { opacity: 1, transform: "none" };

  return (
    <section
      id="field-kit"
      className="py-28 md:py-36 relative overflow-hidden bg-foreground text-background"
    >
      {/* Stage backdrop */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, hsl(var(--background)) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-72 opacity-60 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(80,200,255,0.18) 0%, transparent 70%)",
        }}
      />
      <div className="container max-w-7xl mx-auto relative">
        <div className="max-w-3xl mb-16 md:mb-24">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent mb-6">
            § Coming soon — Field Capture Kit
          </div>
          <h2 className="text-4xl md:text-6xl leading-[1.04] text-balance font-medium">
            Capture customer signal
            <br />
            <span className="text-background/60">in the room, not after.</span>
          </h2>
          <p className="mt-6 text-lg text-background/70 max-w-2xl leading-relaxed text-pretty">
            Two pocket-sized recorders that pair directly with your Context Hub.
            Run them in parallel at conferences, customer interviews, and field
            visits — audio uploads itself, gets transcribed, and turns into
            evidence you can ground decisions on.
          </p>
        </div>

        <div ref={ref} className="grid md:grid-cols-2 gap-12 md:gap-10 items-stretch">
          {/* Clip card */}
          <div
            className="relative rounded-3xl border border-white/10 bg-white/[0.02] p-10 md:p-12 backdrop-blur-sm flex flex-col"
            style={baseStyle(0)}
            data-testid="field-kit-clip"
          >
            <div className="label-mono text-accent mb-3">Primary · The Clip</div>
            <h3 className="text-2xl md:text-3xl font-medium mb-2">
              Clip it on. Forget about it.
            </h3>
            <p className="text-background/70 text-sm leading-relaxed mb-10 max-w-md">
              Pocket-sized recorder with a live timer screen. One button press
              and you're capturing the room.
            </p>
            <div className="flex-1 flex items-center justify-center py-8 md:py-12">
              <Clip revealed={revealed} animate={animate} />
            </div>
            <ul className="mt-10">
              <Spec k="Storage" v="16 GB internal" />
              <Spec k="Battery" v="~10+ hrs" />
              <Spec k="Screen" v="Live REC timer" />
              <Spec k="Quirk" v="One-press record" />
            </ul>
          </div>

          {/* Puck card */}
          <div
            className="relative rounded-3xl border border-white/10 bg-white/[0.02] p-10 md:p-12 backdrop-blur-sm flex flex-col"
            style={baseStyle(180)}
            data-testid="field-kit-puck"
          >
            <div className="label-mono text-accent mb-3">Backup · The Puck</div>
            <h3 className="text-2xl md:text-3xl font-medium mb-2">
              Slide it on. Crash-proof.
            </h3>
            <p className="text-background/70 text-sm leading-relaxed mb-10 max-w-md">
              Always-on round recorder, no screen to fumble with. Auto-saves
              every two hours so a dead battery never loses a session.
            </p>
            <div className="flex-1 flex items-center justify-center py-8 md:py-12">
              <Puck revealed={revealed} animate={animate} />
            </div>
            <ul className="mt-10">
              <Spec k="Storage" v="128 GB internal" />
              <Spec k="Battery" v="~30+ hrs" />
              <Spec k="Screen" v="LED only" />
              <Spec k="Quirk" v="Auto-saves every 2 hrs" />
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center gap-5 text-center">
          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href="mailto:naveen@requisor.io?subject=Field%20Capture%20Kit%20waitlist"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-6 py-3.5 rounded-full text-sm font-medium hover:bg-accent/90 transition-all hover:gap-3"
              data-testid="field-kit-waitlist"
            >
              Join the waitlist
              <span className="font-mono">→</span>
            </a>
            <a
              href="https://calendly.com/requisor" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-medium text-background border border-background/25 hover:border-background/60 transition-colors"
            >
              Talk to founder
              <span className="font-mono">→</span>
            </a>
          </div>
          <p className="label-mono text-background/40">
            Built for the Peak conference series. Wider rollout coming.
          </p>
        </div>
      </div>
    </section>
  );
}
