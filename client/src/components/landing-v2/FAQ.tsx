import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "How is this different from Productboard, Aha, or Dovetail?",
    a: "Those tools assume a PM will manually log feedback, tag it, and write the spec. Requisor assumes software does that. We ingest signal continuously from your meeting, support, chat, and CRM tools, ground it in a product context graph, and let agents draft specs with citations. The architecture is agent-first, not form-first.",
  },
  {
    q: "Is this just a wrapper on ChatGPT?",
    a: "No. A wrapper takes your prompt and forwards it to a model. Requisor is a context layer — ingestion connectors, a structured graph, hybrid retrieval, and a controller that routes work across specialized agents. The model call is the last 5%; the other 95% is the context engineering underneath.",
  },
  {
    q: "What data sources do you support today?",
    a: "Google Meet, Zoom, Microsoft Teams, Slack, Discord, Jira, HubSpot, Notion, plus manual paste and file upload for everything else. We are adding Gong, Intercom, Zendesk, Linear, and Salesforce next. If your source is not listed, the manual paste path covers it today.",
  },
  {
    q: "How do you handle privacy and customer data?",
    a: "Your workspace is isolated. We do not train on your data. Transcripts and documents are encrypted at rest and in transit. Enterprise tiers offer private model routing and data residency. Full security overview available on request.",
  },
  {
    q: "Who is this for?",
    a: "Heads of Product, founding PMs, and small product teams (2–20 people) who are drowning in signal and shipping the wrong things. If you have 8+ surfaces where customer feedback lives and a roadmap that feels disconnected from reality, you are the buyer.",
  },
  {
    q: "What does onboarding look like?",
    a: "Day one: connect 2–3 sources and ingest the last 90 days. Day two to seven: the context graph builds, agents start drafting. Week two: you are running planning meetings off Requisor's prioritization output. Most teams replace a spreadsheet within the first sprint.",
  },
];

const FAQ = () => (
  <section id="faq" className="py-28 md:py-36">
    <div className="container max-w-5xl mx-auto">
      <div className="mb-16">
        <div className="label-mono mb-6">§ Frequently asked</div>
        <h2 className="text-4xl md:text-5xl leading-tight text-balance">
          The questions every PM asks
          <br />
          <span className="text-muted-foreground">before they sign up.</span>
        </h2>
      </div>

      <Accordion type="single" collapsible className="space-y-3">
        {faqs.map((f, i) => (
          <AccordionItem
            key={i}
            value={`faq-${i}`}
            className="border border-border rounded-2xl px-6 md:px-8 bg-background"
          >
            <AccordionTrigger className="text-left text-lg md:text-xl font-medium py-6 hover:no-underline">
              {f.q}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed text-base pb-6">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </section>
);

export default FAQ;
