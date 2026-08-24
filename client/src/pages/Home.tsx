import { Navbar } from "@/components/layout/Navbar";
import { Hero } from "@/components/sections/Hero";
import { Comparison } from "@/components/sections/Comparison";
import { ToolsReplacement } from "@/components/sections/ToolsReplacement";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { Testimonials } from "@/components/sections/Testimonials";
import { CTA } from "@/components/sections/CTA";
import { Footer } from "@/components/sections/Footer";


export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      
      <Navbar />
      <main>
        <Hero />
        <Comparison />
        <ToolsReplacement />
        {/* <AIAgentsSection /> */}
        <FeatureGrid />
        {/* <AgentSquad /> */}
        <CTA />
        <Testimonials />
      </main>
      <Footer />
    </div>
  );
}
