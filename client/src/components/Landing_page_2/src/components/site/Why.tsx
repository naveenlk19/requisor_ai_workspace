
import { motion, } from "framer-motion";
import {
  X,
  Check,
} from "lucide-react";
export function Why() {
  const comparisonRows = [
    {
      left: "One-off prompts. No persistent context engineering.",
      right: "Structured context layers built automatically from your sources",
    },
    {
      left: "Requires manual input of transcripts, notes, and data",
      right: "Automatic ingestion from Zoom, Meet, Teams, ChatGPT exports, and files",
    },
    {
      left: "Context fragmented across tools and chat windows",
      right: "One context hub that improves the more you use it",
    },
    {
      left: "Outputs prose, not structured execution",
      right: "Parsed insights + RICE-scored decisions + execution-ready plans",
    },
    {
      left: "You assemble the product story",
      right: "Evidence is automatically linked from feedback → feature → task → ticket",
    },
  ];

  return (
    <section id="context-engineering" className="py-20 md:py-32 relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center mb-14"
        >
          <p className="label-mono text-accent-deep mb-4">Context Engineering</p>
          <h2 className="text-3xl md:text-5xl font-medium mb-4 tracking-tight leading-tight">
            Why not just use <span className="text-muted-foreground">ChatGPT?</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            General-purpose chatbots are great for brainstorming. But product decisions need
            <span className="text-foreground font-medium"> context engineering</span> — the discipline of feeding LLMs
            the right context, not just better prompts.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4 md:gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center md:text-left"
          >
            <div className="inline-flex items-center text-pretty gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium mb-4">
              ChatGPT / Claude (raw)
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center md:text-left"
          >
            <div className="inline-flex text-pretty items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-4">
              Requisor (your context hub)
            </div>
          </motion.div>
        </div>

        <div className="space-y-3 mt-2">
          {comparisonRows.map((row, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="grid md:grid-cols-2 gap-3 md:gap-6 text-pretty"
            >
              <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">{row.left}</p>
              </div>
              <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
                <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-foreground">{row.right}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="text-center mt-10 text-lg font-medium text-balance text-foreground"
        >
          ChatGPT helps you <span className="text-muted-foreground">think</span>. Requisor helps you{" "}
          <span className="text-emerald-400">decide and execute</span>.
        </motion.p>
      </div>
    </section>
  );
}
export default Why;
