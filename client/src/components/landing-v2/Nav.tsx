import mascot from "./assets/requisor-mascot.png";
import { useAuth } from "@/hooks/useAuth.tsx";
import { useLocation } from "wouter";

const Nav = () => {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const goAuth = (e: React.MouseEvent) => {
    e.preventDefault();
    setLocation(isAuthenticated ? "/dashboard" : "/auth");
  };
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background/75 border-b border-border/60">
      <div className="container max-w-7xl mx-auto flex items-center justify-between py-4">
        <a href="#" className="flex items-center gap-2.5">
          <img src={mascot} alt="Requisor" className="h-9 w-9 rounded-lg" />
          <span className="text-lg font-medium tracking-tight">Requisor</span>
        </a>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#flow" className="hover:text-foreground transition-colors">Context Hub</a>
          <a href="#flow" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#shift" className="hover:text-foreground transition-colors">The shift</a>
          <a href="#workflows" className="hover:text-foreground transition-colors">Workflows</a>
        </nav>
        <div className="flex items-center gap-3">
          <a href="/auth" onClick={goAuth} className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground">
            {isAuthenticated ? "Dashboard" : "Sign in"}
          </a>
          <a href="/auth" onClick={goAuth} className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-full text-sm font-medium hover:bg-foreground/90 transition-colors">
            {isAuthenticated ? "Open app" : "Start free"}
            <span className="font-mono text-xs opacity-60">↗</span>
          </a>
        </div>
      </div>
    </header>
  );
};

export default Nav;
