import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";

// logo.dev token (same as Hero)
const LOGO_TOKEN = "pk_X-1ZO13GSgeOoUrIuJ6GMQ";
const logo = (domain: string, size = 48) =>
  `https://img.logo.dev/${domain}?token=${LOGO_TOKEN}&size=${size}&format=png`;

const SOURCES = [
  { name: "Gong", domain: "gong.io" },
  { name: "Zendesk", domain: "zendesk.com" },
  { name: "Intercom", domain: "intercom.com" },
  { name: "Slack", domain: "slack.com" },
  { name: "Jira", domain: "atlassian.com" },
  { name: "Notion", domain: "notion.so" },
  { name: "HubSpot", domain: "hubspot.com" },
  { name: "Linear", domain: "linear.app" },
] as const;

type Source = typeof SOURCES[number];

// 8-bit dino sprite (16x16 grid). 1 = body, 2 = eye, 3 = mouth open accent
const DINO_FRAMES: number[][][] = [
  // frame A — mouth closed
  [
    [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,1,1,1,1,1,2,2,1],
    [0,0,0,0,0,0,0,0,1,1,1,1,1,2,2,1],
    [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0],
  ],
  // frame B — mouth open (chomp)
  [
    [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,1,1,1,1,1,2,2,1],
    [0,0,0,0,0,0,0,0,1,1,1,1,1,2,2,1],
    [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,1,1,1,1,3,3,3,3],
    [1,0,0,0,0,0,0,1,1,1,1,1,3,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,3,3,3,3],
    [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,1,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,0],
  ],
];

const PIXEL = 6; // px per dino-pixel
const DINO_SIZE = 16 * PIXEL; // 96
const STAGE_H = 480;
const TARGET_PER_SOURCE = 5; // signals needed to "ground" a source

type Packet = {
  id: number;
  source: Source;
  x: number;
  y: number;
  vy: number;
};

type Pop = { id: number; x: number; y: number; label: string };

const DinoFeast = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(800);
  const [dinoX, setDinoX] = useState(360);
  const [frame, setFrame] = useState(0);
  const [chompUntil, setChompUntil] = useState(0);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [fed, setFed] = useState<Record<string, number>>(() =>
    Object.fromEntries(SOURCES.map((s) => [s.name, 0]))
  );
  const [missed, setMissed] = useState(0);
  const [running, setRunning] = useState(true);
  const idRef = useRef(0);
  const popIdRef = useRef(0);
  const keysRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const dinoXRef = useRef(dinoX);
  dinoXRef.current = dinoX;

  const totalFed = useMemo(
    () => Object.values(fed).reduce((a, b) => a + b, 0),
    [fed]
  );
  const totalNeeded = SOURCES.length * TARGET_PER_SOURCE;
  const groundedCount = useMemo(
    () => Object.values(fed).filter((v) => v >= TARGET_PER_SOURCE).length,
    [fed]
  );
  const won = groundedCount === SOURCES.length;

  // SEO
  useEffect(() => {
    document.title = "Feed the Dino — Build Requisor's Context Hub";
    const meta =
      document.querySelector('meta[name="description"]') ||
      (() => {
        const m = document.createElement("meta");
        m.setAttribute("name", "description");
        document.head.appendChild(m);
        return m;
      })();
    meta.setAttribute(
      "content",
      "Feed the 8-bit dino signal from Gong, Slack, Jira and more to build Requisor's Context Hub."
    );
  }, []);

  // Resize
  useEffect(() => {
    const onResize = () => {
      if (stageRef.current) setStageW(stageRef.current.clientWidth);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") keysRef.current.left = true;
      if (e.key === "ArrowRight" || e.key === "d") keysRef.current.right = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") keysRef.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d") keysRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Pointer/touch — drag to move dino
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - DINO_SIZE / 2;
    setDinoX(Math.max(0, Math.min(rect.width - DINO_SIZE, x)));
  }, []);

  // Spawn packets — bias toward sources that are still hungry
  useEffect(() => {
    if (!running || won) return;
    const t = setInterval(() => {
      const hungry = SOURCES.filter((s) => fed[s.name] < TARGET_PER_SOURCE);
      const pool = hungry.length ? hungry : SOURCES;
      const source = pool[Math.floor(Math.random() * pool.length)];
      idRef.current += 1;
      setPackets((p) => [
        ...p,
        {
          id: idRef.current,
          source,
          x: Math.random() * (stageW - 48),
          y: -48,
          vy: 1.6 + Math.random() * 1.6,
        },
      ]);
    }, 650);
    return () => clearInterval(t);
  }, [running, stageW, fed, won]);

  // Idle blink animation (mouth closed → open) when not actively chomping
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() > chompUntil) setFrame(0);
    }, 240);
    return () => clearInterval(t);
  }, [chompUntil]);

  // Game loop
  useEffect(() => {
    if (!running || won) return;
    let raf = 0;
    const tick = () => {
      const k = keysRef.current;
      if (k.left || k.right) {
        setDinoX((x) => {
          const next = x + (k.right ? 6 : 0) - (k.left ? 6 : 0);
          return Math.max(0, Math.min(stageW - DINO_SIZE, next));
        });
      }

      setPackets((prev) => {
        const dx = dinoXRef.current;
        const dinoTop = STAGE_H - DINO_SIZE - 16;
        const mouthRect = {
          x: dx + 8,
          y: dinoTop + 12,
          w: DINO_SIZE - 16,
          h: 36,
        };
        const gained: Source[] = [];
        let lost = 0;
        const next: Packet[] = [];
        for (const p of prev) {
          const ny = p.y + p.vy;
          const hit =
            p.x + 40 > mouthRect.x &&
            p.x < mouthRect.x + mouthRect.w &&
            ny + 40 > mouthRect.y &&
            ny < mouthRect.y + mouthRect.h;
          if (hit) {
            gained.push(p.source);
            continue;
          }
          if (ny > STAGE_H) {
            lost += 1;
            continue;
          }
          next.push({ ...p, y: ny });
        }
        if (gained.length) {
          setFed((f) => {
            const nf = { ...f };
            for (const s of gained) {
              if (nf[s.name] < TARGET_PER_SOURCE) nf[s.name] += 1;
            }
            return nf;
          });
          setChompUntil(Date.now() + 180);
          setFrame(1);
          // pop labels
          setPops((ps) => [
            ...ps,
            ...gained.map((s) => {
              popIdRef.current += 1;
              return {
                id: popIdRef.current,
                x: dinoXRef.current + DINO_SIZE / 2,
                y: STAGE_H - DINO_SIZE - 8,
                label: `+${s.name}`,
              };
            }),
          ]);
        }
        if (lost) setMissed((m) => m + lost);
        return next;
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, stageW, won]);

  // Fade pop labels
  useEffect(() => {
    if (!pops.length) return;
    const t = setTimeout(() => {
      setPops((ps) => ps.slice(1));
    }, 700);
    return () => clearTimeout(t);
  }, [pops]);

  const reset = () => {
    setFed(Object.fromEntries(SOURCES.map((s) => [s.name, 0])));
    setMissed(0);
    setPackets([]);
    setPops([]);
    setRunning(true);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="container max-w-6xl mx-auto flex items-center justify-between py-6">
        <Link to="/" className="label-mono hover:text-accent-deep">
          ← Back to Requisor
        </Link>
        <div className="label-mono">Context Hub · Training Mode</div>
      </header>

      <section className="container max-w-6xl mx-auto pb-16">
        <div className="label-mono text-accent-deep mb-3">Feed the dino</div>
        <h1 className="text-4xl md:text-6xl font-medium tracking-tight mb-3">
          Every signal is a snack.
        </h1>
        <p className="text-muted-foreground max-w-xl mb-8">
          Catch falling signal from each tool to ground it into Requisor's
          Context Hub. Feed every source to complete the hub. Drag, or use
          ← / →.
        </p>

        {/* Hub progress meters */}
        <div className="mb-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="label-mono">
              Context Hub — {groundedCount}/{SOURCES.length} grounded
            </div>
            <div className="label-mono text-muted-foreground">
              Signals: {totalFed}/{totalNeeded} · Missed: {missed}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SOURCES.map((s) => {
              const v = fed[s.name];
              const pct = Math.min(100, (v / TARGET_PER_SOURCE) * 100);
              const done = v >= TARGET_PER_SOURCE;
              return (
                <div
                  key={s.name}
                  className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                    done
                      ? "border-accent-deep bg-accent/10"
                      : "border-border"
                  }`}
                >
                  <img
                    src={logo(s.domain, 32)}
                    alt={s.name}
                    className="w-6 h-6 shrink-0"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm truncate">{s.name}</span>
                      <span className="label-mono text-xs">
                        {done ? "✓" : `${v}/${TARGET_PER_SOURCE}`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full bg-foreground/10 rounded">
                      <div
                        className="h-full rounded bg-accent-deep transition-[width] duration-200"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4 label-mono">
          <button
            onClick={reset}
            className="text-foreground hover:text-accent-deep underline-offset-4 hover:underline"
          >
            Reset
          </button>
          <button
            onClick={() => setRunning((r) => !r)}
            className="text-foreground hover:text-accent-deep"
          >
            {running ? "Pause" : "Resume"}
          </button>
        </div>

        <div
          ref={stageRef}
          onPointerMove={onPointerMove}
          className="relative w-full overflow-hidden rounded-2xl border border-border bg-card touch-none select-none cursor-none"
          style={{
            height: STAGE_H,
            backgroundImage:
              "linear-gradient(to bottom, hsl(var(--accent) / 0.08), transparent 60%), repeating-linear-gradient(0deg, hsl(var(--foreground) / 0.04) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, hsl(var(--foreground) / 0.04) 0 1px, transparent 1px 24px)",
            imageRendering: "pixelated",
          }}
        >
          {/* falling packets */}
          {packets.map((p) => (
            <div
              key={p.id}
              className="absolute"
              style={{
                left: p.x,
                top: p.y,
                width: 40,
                height: 40,
                imageRendering: "pixelated",
              }}
            >
              <div className="w-full h-full bg-card border-2 border-foreground/80 rounded-md flex items-center justify-center shadow-[3px_3px_0_0_hsl(var(--foreground))]">
                <img
                  src={logo(p.source.domain)}
                  alt={p.source.name}
                  className="w-7 h-7"
                  style={{ imageRendering: "pixelated" }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            </div>
          ))}

          {/* pop labels */}
          {pops.map((p) => (
            <div
              key={p.id}
              className="absolute pointer-events-none label-mono text-xs text-accent-deep"
              style={{
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -100%)",
                animation: "popUp 700ms ease-out forwards",
              }}
            >
              {p.label}
            </div>
          ))}

          {/* ground line */}
          <div
            className="absolute left-0 right-0"
            style={{
              bottom: 12,
              height: 2,
              background:
                "repeating-linear-gradient(90deg, hsl(var(--foreground)) 0 8px, transparent 8px 16px)",
            }}
          />

          {/* dino */}
          <div
            className="absolute"
            style={{
              left: dinoX,
              bottom: 16,
              width: DINO_SIZE,
              height: DINO_SIZE,
            }}
          >
            <DinoSprite frame={frame} />
          </div>

          {/* win overlay */}
          {won && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6">
              <div className="label-mono text-accent-deep mb-2">
                Context Hub complete
              </div>
              <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-3">
                The dino is full.
              </h2>
              <p className="text-muted-foreground max-w-md mb-6">
                Every source is grounded. Requisor can now reason across all of
                your customer signal.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="px-4 py-2 rounded-md bg-foreground text-background hover:bg-accent-deep transition-colors"
                >
                  Feed it again
                </button>
                <Link
                  to="/"
                  className="px-4 py-2 rounded-md border border-border hover:border-accent-deep"
                >
                  Back to Requisor
                </Link>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Tip: every chomp grounds a signal into the hub. Miss too many and
          you're back to scattered tools.
        </p>
      </section>

      <style>{`
        @keyframes popUp {
          0% { opacity: 0; transform: translate(-50%, -80%); }
          20% { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -160%); }
        }
      `}</style>
    </main>
  );
};

const DinoSprite = ({ frame }: { frame: number }) => {
  const grid = DINO_FRAMES[frame];
  const cells: JSX.Element[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = grid[y][x];
      if (!v) continue;
      const color =
        v === 1
          ? "hsl(var(--accent-deep))"
          : v === 2
          ? "hsl(var(--foreground))"
          : "hsl(var(--accent))";
      cells.push(
        <div
          key={`${x}-${y}`}
          style={{
            position: "absolute",
            left: x * PIXEL,
            top: y * PIXEL,
            width: PIXEL,
            height: PIXEL,
            background: color,
          }}
        />
      );
    }
  }
  return <div className="relative w-full h-full">{cells}</div>;
};

export default DinoFeast;
