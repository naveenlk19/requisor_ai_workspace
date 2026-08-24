export type SignalSource = "Gong" | "Zendesk" | "Intercom" | "Slack" | "Jira" | "HubSpot" | "Linear" | "Notion";

export interface Signal {
  id: string;
  source: SignalSource;
  account: string;
  arr: string;
  excerpt: string;
  speaker?: string;
  timestamp: string;
  sentiment: "positive" | "neutral" | "negative" | "blocker";
}

export interface Cluster {
  id: string;
  theme: string;
  signalCount: number;
  arrImpacted: string;
  accounts: string[];
  topQuotes: string[];
}

export interface SpecBlock {
  heading: string;
  body: string;
  citations: string[]; // signal ids
}

export interface RankedItem {
  rank: number;
  title: string;
  rice: { reach: number; impact: number; confidence: number; effort: number; score: number };
  arr: string;
  churnRisk: "Low" | "Medium" | "High";
  goalAlignment: string;
  evidence: number;
  status: "Now" | "Next" | "Later";
}

export interface TraceNode {
  layer: "Feature" | "Spec" | "Cluster" | "Signal";
  id: string;
  label: string;
  meta: string;
  source?: SignalSource;
}

export interface TriageItem {
  id: string;
  source: SignalSource;
  ticket: string;
  customer: string;
  theme: string;
  occurrences: number;
  trend: number; // % change WoW
  firstSeen: string;
  status: "New theme" | "Growing" | "Steady" | "Resolved";
}

export interface WorkflowData {
  slug: string;
  tag: string;
  title: string;
  metric: string;
  metricLabel: string;
  intro: string;
  kind: "discovery" | "prioritization" | "traceability" | "triage";
}

export const WORKFLOWS: Record<string, WorkflowData> = {
  discovery: {
    slug: "discovery",
    tag: "Discovery",
    title: "Customer call → drafted PRD",
    metric: "12 min",
    metricLabel: "Median time, transcript to draft",
    intro: "A Gong recording lands. Within minutes, the research agent has clustered the asks, surfaced the dollars on the table, and the spec agent has drafted a PRD with every claim tied back to a moment in the conversation.",
    kind: "discovery",
  },
  prioritization: {
    slug: "prioritization",
    tag: "Prioritization",
    title: "Quarterly planning, evidence-grounded",
    metric: "0 spreadsheets",
    metricLabel: "Inputs to your roadmap review",
    intro: "Every open request, ranked. Revenue impact, churn risk, and stated goals weighed transparently. Every score links to the underlying customer evidence — no more debating which voice was loudest in the room.",
    kind: "prioritization",
  },
  traceability: {
    slug: "traceability",
    tag: "Traceability",
    title: "Every Jira ticket, linked back",
    metric: "100%",
    metricLabel: "Coverage from feature to original signal",
    intro: "Pick any shipped feature. Walk the chain backwards: spec → cluster → individual customer moment. The traceability agent maintains the graph so QBRs, board updates, and ARR-attribution work themselves.",
    kind: "traceability",
  },
  triage: {
    slug: "triage",
    tag: "Triage",
    title: "Support tickets become product signal",
    metric: "Continuous",
    metricLabel: "Stream from Zendesk + Intercom",
    intro: "The long tail of support stops disappearing. Themes surface as they emerge, growing themes get flagged before they become escalations, and product owners see the ticket-to-feature loop close in real time.",
    kind: "triage",
  },
};

// ─── Discovery dataset ─────────────────────────────────────────
export const DISCOVERY_SIGNALS: Signal[] = [
  { id: "S-1042", source: "Gong", account: "Northwind Logistics", arr: "$240k", excerpt: "We're exporting to CSV every Monday and re-uploading. If we could just schedule a recurring sync, that's an hour back per week per ops lead.", speaker: "Maya — VP Ops", timestamp: "Tue 10:14", sentiment: "blocker" },
  { id: "S-1043", source: "Gong", account: "Northwind Logistics", arr: "$240k", excerpt: "Honestly, the approval flow is the deal-breaker. Procurement wants two-step sign-off before anything hits the warehouse system.", speaker: "Devraj — Procurement Lead", timestamp: "Tue 10:21", sentiment: "blocker" },
  { id: "S-1044", source: "Gong", account: "Helios Robotics", arr: "$185k", excerpt: "Scheduled exports would be huge. We have a Zapier hack right now and it broke twice last quarter.", speaker: "Sam — RevOps", timestamp: "Mon 15:02", sentiment: "negative" },
  { id: "S-1051", source: "Zendesk", account: "Helios Robotics", arr: "$185k", excerpt: "Ticket #88421: requesting recurring export to S3 bucket — manual process is fragile.", timestamp: "Mon 09:30", sentiment: "negative" },
  { id: "S-1058", source: "Slack", account: "Internal #cs-escalations", arr: "—", excerpt: "Three accounts this week asking the same thing about scheduled exports. Filing as a theme.", speaker: "Priya — CSM", timestamp: "Wed 11:48", sentiment: "neutral" },
  { id: "S-1062", source: "Gong", account: "Apex Manufacturing", arr: "$420k", excerpt: "If we sign for the enterprise tier, two-step approvals are non-negotiable. Audit committee won't budge.", speaker: "Helen — CFO", timestamp: "Wed 14:00", sentiment: "blocker" },
  { id: "S-1067", source: "Intercom", account: "Brightline Studio", arr: "$48k", excerpt: "Can we get notified by email when an export finishes? Slack is fine but our finance lead lives in email.", timestamp: "Thu 08:12", sentiment: "neutral" },
];

export const DISCOVERY_CLUSTERS: Cluster[] = [
  {
    id: "C-211",
    theme: "Recurring scheduled exports",
    signalCount: 14,
    arrImpacted: "$1.2M",
    accounts: ["Northwind", "Helios", "Brightline", "+5 others"],
    topQuotes: ["S-1042", "S-1044", "S-1051"],
  },
  {
    id: "C-212",
    theme: "Two-step approval flow",
    signalCount: 9,
    arrImpacted: "$880k",
    accounts: ["Northwind", "Apex", "+3 others"],
    topQuotes: ["S-1043", "S-1062"],
  },
  {
    id: "C-213",
    theme: "Email notifications for jobs",
    signalCount: 6,
    arrImpacted: "$210k",
    accounts: ["Brightline", "+4 others"],
    topQuotes: ["S-1067"],
  },
];

export const DISCOVERY_SPEC: SpecBlock[] = [
  {
    heading: "Problem",
    body: "Operations teams at mid-market and enterprise customers manually re-export data on a weekly cadence to keep downstream systems in sync. The workflow is fragile (Zapier outages cited twice), eats ~1 hour per ops lead per week, and is blocking at least one $240k expansion.",
    citations: ["S-1042", "S-1044", "S-1051"],
  },
  {
    heading: "Proposed solution",
    body: "Introduce Scheduled Exports: cron-style configuration per workspace, target destinations including S3, GCS, and email. Failures surface in the existing notification center and to a configurable Slack channel.",
    citations: ["S-1044", "S-1051", "S-1067"],
  },
  {
    heading: "Out of scope (v1)",
    body: "Two-step approval flow is a separate cluster (C-212) with its own ARR profile. Tracked as a dependency for Apex but not a blocker for v1 ship.",
    citations: ["S-1043", "S-1062"],
  },
];

// ─── Prioritization dataset ────────────────────────────────────
export const RANKED_ITEMS: RankedItem[] = [
  { rank: 1, title: "Scheduled exports (S3 / GCS / email)", rice: { reach: 1200, impact: 3, confidence: 0.9, effort: 5, score: 648 }, arr: "$1.2M", churnRisk: "High", goalAlignment: "Reduce ops drag (Q3 OKR)", evidence: 14, status: "Now" },
  { rank: 2, title: "Two-step approval workflow", rice: { reach: 480, impact: 3, confidence: 0.8, effort: 8, score: 144 }, arr: "$880k", churnRisk: "High", goalAlignment: "Enterprise-readiness", evidence: 9, status: "Now" },
  { rank: 3, title: "SAML/SSO with SCIM provisioning", rice: { reach: 720, impact: 2, confidence: 0.95, effort: 13, score: 105 }, arr: "$1.6M", churnRisk: "Medium", goalAlignment: "Enterprise-readiness", evidence: 22, status: "Now" },
  { rank: 4, title: "Audit log retention to 12 months", rice: { reach: 350, impact: 2, confidence: 0.9, effort: 3, score: 210 }, arr: "$540k", churnRisk: "Medium", goalAlignment: "Compliance", evidence: 7, status: "Next" },
  { rank: 5, title: "Granular role permissions", rice: { reach: 900, impact: 2, confidence: 0.7, effort: 13, score: 97 }, arr: "$720k", churnRisk: "Medium", goalAlignment: "Enterprise-readiness", evidence: 18, status: "Next" },
  { rank: 6, title: "Email notifications for export jobs", rice: { reach: 1100, impact: 1, confidence: 0.85, effort: 2, score: 467 }, arr: "$210k", churnRisk: "Low", goalAlignment: "Reduce ops drag", evidence: 6, status: "Next" },
  { rank: 7, title: "Bulk edit in table view", rice: { reach: 800, impact: 1, confidence: 0.8, effort: 5, score: 128 }, arr: "$130k", churnRisk: "Low", goalAlignment: "Activation", evidence: 11, status: "Later" },
  { rank: 8, title: "Mobile companion app (read-only)", rice: { reach: 600, impact: 1, confidence: 0.5, effort: 21, score: 14 }, arr: "$80k", churnRisk: "Low", goalAlignment: "—", evidence: 4, status: "Later" },
];

// ─── Traceability dataset ──────────────────────────────────────
export const TRACE_FEATURE = {
  name: "Scheduled Exports v1.0",
  shipped: "Apr 18, 2026",
  owner: "Ana — PM, Data Platform",
  jira: "DAT-1184",
  arrAttributed: "$1.2M influenced · $360k closed-won",
};

export const TRACE_CHAIN: TraceNode[] = [
  { layer: "Feature", id: "DAT-1184", label: "Scheduled Exports v1.0", meta: "Shipped Apr 18 · 11 sub-tickets · 4 engineers" },
  { layer: "Spec", id: "PRD-088", label: "Scheduled Exports PRD", meta: "Authored by spec agent · approved Mar 02 · 3 revisions" },
  { layer: "Cluster", id: "C-211", label: "Recurring scheduled exports", meta: "14 signals · 8 accounts · $1.2M ARR" },
  { layer: "Signal", id: "S-1042", label: "Northwind — Maya, VP Ops", meta: "Gong · Tue 10:14 · blocker", source: "Gong" },
  { layer: "Signal", id: "S-1044", label: "Helios — Sam, RevOps", meta: "Gong · Mon 15:02 · negative", source: "Gong" },
  { layer: "Signal", id: "S-1051", label: "Helios — Ticket #88421", meta: "Zendesk · Mon 09:30 · negative", source: "Zendesk" },
];

export const TRACE_RECEIPTS = [
  { account: "Northwind Logistics", outcome: "Renewed + expanded", arr: "$240k → $310k", date: "Apr 22" },
  { account: "Helios Robotics", outcome: "Closed-won (expansion)", arr: "+$90k", date: "Apr 25" },
  { account: "Brightline Studio", outcome: "Churn risk cleared", arr: "$48k retained", date: "Apr 19" },
];

// ─── Triage dataset ────────────────────────────────────────────
export const TRIAGE_ITEMS: TriageItem[] = [
  { id: "T-9911", source: "Zendesk", ticket: "#88421", customer: "Helios Robotics", theme: "Recurring scheduled exports", occurrences: 14, trend: 22, firstSeen: "11 days ago", status: "Growing" },
  { id: "T-9912", source: "Intercom", ticket: "conv_4ab21", customer: "Brightline Studio", theme: "Email notifications for jobs", occurrences: 6, trend: 50, firstSeen: "5 days ago", status: "New theme" },
  { id: "T-9913", source: "Zendesk", ticket: "#88512", customer: "Apex Manufacturing", theme: "Two-step approval flow", occurrences: 9, trend: 12, firstSeen: "3 weeks ago", status: "Growing" },
  { id: "T-9914", source: "Intercom", ticket: "conv_4b772", customer: "Cobalt Health", theme: "SSO failures on Okta", occurrences: 18, trend: -8, firstSeen: "2 months ago", status: "Steady" },
  { id: "T-9915", source: "Zendesk", ticket: "#88615", customer: "Stratus Bank", theme: "Audit log export format", occurrences: 7, trend: 0, firstSeen: "9 days ago", status: "Steady" },
  { id: "T-9916", source: "Zendesk", ticket: "#88401", customer: "Northwind Logistics", theme: "Recurring scheduled exports", occurrences: 14, trend: 22, firstSeen: "11 days ago", status: "Resolved" },
  { id: "T-9917", source: "Intercom", ticket: "conv_4c001", customer: "Vanta Foods", theme: "Bulk edit in table view", occurrences: 11, trend: 5, firstSeen: "1 month ago", status: "Steady" },
];

export const TRIAGE_THEMES = [
  { theme: "Recurring scheduled exports", count: 28, accounts: 8, status: "Promoted to PRD" as const },
  { theme: "Two-step approval flow", count: 19, accounts: 5, status: "In cluster" as const },
  { theme: "Email notifications for jobs", count: 12, accounts: 6, status: "New" as const },
  { theme: "SSO failures on Okta", count: 18, accounts: 3, status: "In cluster" as const },
  { theme: "Audit log export format", count: 7, accounts: 4, status: "Watching" as const },
];
