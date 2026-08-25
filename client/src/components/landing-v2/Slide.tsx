import type { ReactNode } from "react";

interface SlideProps {
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  align?: "left" | "center";
  id?: string;
}

const Slide = ({ eyebrow, title, body, children, align = "left", id }: SlideProps) => {
  const alignment = align === "center" ? "items-center text-center" : "items-start text-left";
  return (
    <section
      id={id}
      className="relative w-full min-h-[600px] aspect-[16/9] overflow-hidden border border-border/60 rounded-2xl bg-card"
    >
      <div className={`relative z-10 h-full w-full flex flex-col justify-center gap-6 p-12 md:p-16 ${alignment}`}>
        {eyebrow && (
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {eyebrow}
          </span>
        )}
        <h2 className="text-4xl md:text-6xl font-medium tracking-tight leading-[1.05]">
          {title}
        </h2>
        {body && (
          <div className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
            {body}
          </div>
        )}
        {children && <div className="w-full mt-4">{children}</div>}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.08),transparent_60%)]" />
    </section>
  );
};

export default Slide;
