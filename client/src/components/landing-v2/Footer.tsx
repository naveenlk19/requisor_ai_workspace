import mascot from "./assets/requisor-mascot.png";

type FooterLink = { label: string; href: string; external?: boolean };

const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Context Hub", href: "/#flow" },
      { label: "Orchestration", href: "/#workflows" },
      { label: "Connectors", href: "/#flow" },
      { label: "Pricing", href: "/#pricing" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Architecture", href: "/architecture" },
      { label: "RAG for PMs", href: "/architecture" },
      { label: "FAQ", href: "/#faq" },
      { label: "Field Kit", href: "/#field-kit" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/#problem" },
      { label: "Manifesto", href: "/#context-engineering" },
      { label: "Contact", href: "mailto:hello@requisor.io", external: true },
      { label: "Support", href: "/support" },
    ],
  },
];

const scrollToHash = (hash: string) => {
  const id = hash.replace(/^#/, "");
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  }
};

const renderLink = (l: FooterLink) => {
  const className =
    "text-foreground/80 hover:text-accent-deep transition-colors cursor-pointer";
  if (l.external) {
    return (
      <a href={l.href} className={className} rel="noopener noreferrer">
        {l.label}
      </a>
    );
  }
  if (l.href.startsWith("/#") || l.href.startsWith("#")) {
    const hash = l.href.startsWith("/#") ? l.href.slice(1) : l.href;
    return (
      <a
        href={l.href}
        className={className}
        onClick={(e) => {
          const onLanding = window.location.pathname === "/";
          if (onLanding) {
            e.preventDefault();
            scrollToHash(hash);
          }
        }}
      >
        {l.label}
      </a>
    );
  }
  return (
    <a href={l.href} className={className}>
      {l.label}
    </a>
  );
};

const Footer = () => (
  <footer className="border-t border-border/60 py-16">
    <div className="container max-w-7xl mx-auto">
      <div className="grid md:grid-cols-12 gap-10 mb-16">
        <div className="md:col-span-5">
          <div className="flex items-center gap-2.5 mb-4">
            <img src={mascot} alt="" className="h-9 w-9 rounded-lg" />
            <span className="text-lg font-medium tracking-tight">Requisor</span>
          </div>
          <p className="text-muted-foreground max-w-sm leading-relaxed">
            The Context Hub and agentic orchestration layer for modern product teams.
          </p>
        </div>
        {columns.map((c) => (
          <div key={c.heading} className="md:col-span-2">
            <div className="label-mono mb-4">{c.heading}</div>
            <ul className="space-y-2.5 text-sm">
              {c.links.map((l) => (
                <li key={l.label}>{renderLink(l)}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 pt-8 border-t border-border/60 label-mono">
        <span>© 2026 Requisor, Inc.</span>
        <span className="flex-1 text-center min-w-[200px]">
          Snowflake consolidated analytics. Requisor consolidates product context.
        </span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a href="/privacy-policy" className="hover:text-accent-deep transition-colors">
            Privacy
          </a>
          <a href="/terms" className="hover:text-accent-deep transition-colors">
            Terms
          </a>
          <a href="/support" className="hover:text-accent-deep transition-colors">
            Support
          </a>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
