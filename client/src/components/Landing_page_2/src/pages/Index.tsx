import Nav from "@/components/site/Nav";
import Hero from "@/components/site/Hero";
import LogoStrip from "@/components/site/LogoStrip";
import Problem from "@/components/site/Problem";
import Hub from "@/components/site/Hub";
import Flow from "@/components/site/Flow";
import Shift from "@/components/site/Shift";
import Workflows from "@/components/site/Workflows";
import Proof from "@/components/site/Proof";
import Pricing from "@/components/site/Pricing";
import CTA from "@/components/site/CTA";
import Footer from "@/components/site/Footer";
import Why from "@/components/site/Why";
import Testimonials from "@/components/site/Testimonials";
import Parent from "@/components/site/ParentSlider";
import { useEffect } from "react";
const Index = () => {
  useEffect(() => {
    document.title = "Requisor — The Context Hub for product teams";
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
      "Requisor unifies customer signal across every tool and runs AI agents on top. Grounded product decisions, end-to-end traceability.",
    );
  }, []);
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleGetStarted = () => {
    setLocation(isAuthenticated ? "/dashboard" : "/auth");
  };

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (href.startsWith("#")) {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setMobileMenuOpen(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <LogoStrip />
      <Problem />
      <Hub />
      <Flow />
      <Shift />
      <Why />
      <Workflows />
      <Proof />
      <Testimonials />
      <Parent />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
};

export default Index;
