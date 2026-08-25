# IA Restructure — Design Proposal (No Code)

Status: Draft for review
Owner: Design + PM
Scope: Sidebar information architecture, naming for the unified research surface, placement of Requisor Agent / AI Agents, bottom-utility section behavior, mobile considerations
Out of scope: Implementation, billing/auth/pricing changes, Past Discoveries internals, chat input internals (other tasks own these)

---

## 1. Why we are doing this

Multiple users — most clearly Erin — report that Meetings, Evidence Library, Context Brain, Forms, Requisor Agent, and AI Agents all "feel like they overlap" and they cannot tell what each one is for. Specific pain points we have heard:

- Transcripts live in Meetings, but processed/structured insights from those same transcripts live in Context Brain, and uploaded notes/files live in Evidence Library — three places, one mental model.
- Forms is a separate top-level item that most research-focused users never touch.
- Projects is a single nav item; users have to leave their current context to switch projects, and "recent projects" is buried below the main nav.
- AI Agents reads as a parallel product to Requisor Agent, not a marketplace of helpers, so users do not know which one to start in.
- The bottom of the sidebar (Pricing, Team, Settings, Profile, Usage) competes for attention with the main work areas.

Erin's specific suggestion: merge Meetings + Evidence Library + Forms into a single "Brain"-style surface, put Projects collapsibly at the top, and put utility items in a collapsed bottom section that condenses to just the user's name. We agree with the direction; this doc proposes a concrete shape for it before any code changes.

---

## 2. Audit of the current IA

### 2.1 Current sidebar order (authenticated)

Source: `client/src/components/layout/Sidebar.tsx`.

Top → bottom:

1. Logo / collapse toggle
2. Requisor Agent (`/`)
3. Meetings (`/meetings`)
4. Evidence Library (`/evidence`)
5. Context Brain (`/brain`, badge: "AI")
6. Projects (`/projects`)
7. AI Agents (`/ai-agents`, badge: "Hub")
8. Pricing (`/pricing`)
9. Team (`/team`)
10. Forms (`/forms`)
11. Recent Projects list (only when expanded, last 3, links to `/projects/:id`)
12. Usage indicator card (tokens + projects, links to `/profile` and `/pricing`)

### 2.2 What lives behind each main destination

| Sidebar item | Route | Page component | What it actually does |
| --- | --- | --- | --- |
| Requisor Agent | `/` | `agent.tsx` (`AgentPageContent`) | Conversational entry point. Build Mode / Plan Mode chat. |
| Meetings | `/meetings` | `meetings.tsx` (4.4k LOC) | Manual + Teams + Google Meet + Zoom + Slack meetings, transcripts, paste/upload transcript, AI summaries. Source of most raw transcripts. |
| Evidence Library | `/evidence` | `evidence.tsx` | All research artifacts: notes, transcripts (mirrored from Meetings), files, usage data (CSV/JSON imports with AI analysis). Filterable by source + tags. |
| Context Brain | `/brain` | `brain.tsx` | AI-extracted structured insights: problems, features, decisions, insights, questions. Pulled from chat exports (ChatGPT/Claude), pasted notes, meeting notes. Powers the agent's responses. |
| Projects | `/projects` | `projects.tsx` | List of projects. `/projects/:id` opens a project detail page. |
| AI Agents | `/ai-agents` | `Hub` (`components/sections/hub.tsx`) | Cards for: Sociasor, Requisor, Agile Planner, Budget & Quote, Datasor, CRMsor, Ideasor, Prioritisor — plus "agency pack" bundles. Effectively a marketplace today, just not labeled as one. |
| Pricing | `/pricing` | `pricing.tsx` | Plans + upgrade. |
| Team | `/team` | `team.tsx` | Workspace/team management. |
| Forms | `/forms` | `forms.tsx` | Public intake forms (event inquiry style), QR codes, response viewer. Distinct user job from research. |
| Profile (via usage card) | `/profile` | `profile.tsx` | User profile + token/project usage. |
| Settings | `/settings` | `settings.tsx` | App settings. (Not currently in the sidebar.) |

### 2.3 Where the overlap actually is

- **Transcripts** appear in Meetings (raw recording + transcript) and in Evidence Library (same transcript stored as an evidence item with source = `transcript`). Two views of one object.
- **Notes / files / usage data** only live in Evidence Library, but users land in Meetings first because the sidebar puts Meetings above Evidence.
- **Insights** in Context Brain are derived from the same source material (transcripts, pasted ChatGPT, meeting notes). Users cannot tell that "Context Brain" is the *output* of "Evidence Library", not a parallel input surface.
- **Forms** is unrelated to research synthesis. It is a public-facing intake tool, more like a CRM/lead capture utility.
- **AI Agents** vs **Requisor Agent**: Requisor Agent is the chat interface; AI Agents is a hub/marketplace of specialized sub-agents. The naming hides that relationship.

### 2.4 What is *not* broken (and should be preserved)

- The Requisor Agent chat as the primary "do something" surface — users already start there.
- The collapse-to-icons sidebar mode and the mobile drawer behavior.
- The usage indicator card — it is well-liked and surfaces the right info.
- The recent-projects list near the bottom of the expanded sidebar.

---

## 3. Naming the unified surface

Erin proposed "Brain". Two other natural candidates: "Library" and "Context". We considered each.

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **Brain** | Matches Erin's mental model. Strong, memorable, on-brand with "Context Brain" already in product. Implies *intelligence layer*, not just storage. | Collides with the existing "Context Brain" page name; we would have to either rename Context Brain or absorb it. Slightly less self-explanatory to new users. | **Recommended**, with Context Brain becoming a *view* inside Brain (see §5). |
| **Library** | Concrete, accurate (it is a library of research artifacts). Familiar metaphor. | Implies passive storage. Hides the AI-derived insights side (Context Brain). Feels like a step backward from what we have. | Reject as the top-level name. Keep "Library" as the name of the *raw artifacts view* inside Brain. |
| **Context** | Aligns with how the agent uses it ("the agent's context"). Technical-but-clean. | Vague to non-technical users. Easy to confuse with project context / "context window". | Reject as top-level. Keep as conceptual framing in copy. |
| Combined ("Research", "Workspace", "Knowledge") | Neutral. | Adds a fourth name nobody has asked for. | Reject. |

**Recommendation: name the unified surface "Brain"**, with two clearly labeled views inside it (see §5). The current `Context Brain` page does not get a separate sidebar entry — its content becomes the "Insights" view of Brain.

---

## 4. Proposed sidebar structure

### 4.1 Sections, top to bottom

1. **Header** — logo + collapse toggle (unchanged).
2. **Projects (collapsible)** — current project pill on top, search, recent projects, "All projects" link, "+ New project" affordance. Collapsed by default for returning users who already have a current project; expanded by default for new users with 0–1 projects.
3. **Work** (always visible, never collapses):
   - Requisor Agent (`/`) — the chat. The "do" surface.
   - Brain (`/brain`) — the unified Meetings + Evidence + Insights surface. (See §5 for internal IA.)
   - AI Agents (`/ai-agents`) — top-level for now (see §6 for the recommendation).
4. **Build Mode entry** — surfaced contextually inside Requisor Agent rather than as its own sidebar item, because Build Mode is a mode of the agent, not a separate destination. (No sidebar change required.)
5. **Spacer / push to bottom**
6. **Bottom utility (collapsible, condensed by default)** — collapsed shows only an avatar + the user's name + chevron. Expanded reveals: Pricing, Team, Settings, Profile, Agent Marketplace (see §6), Sign out.
7. **Usage indicator card** — stays where it is today, just above the bottom utility section. It is high-signal and users like it.

### 4.2 Wireframe — expanded, project selected, bottom condensed

```
┌────────────────────────────────────┐
│  [logo] Requisor AI         «      │
├────────────────────────────────────┤
│  PROJECT                       ▾   │
│  ● Acme Onboarding Redesign        │
│    ┌────────────────────────────┐  │
│    │ 🔎 Switch project…         │  │
│    └────────────────────────────┘  │
│    Recent                          │
│    · Acme Onboarding Redesign      │
│    · Pricing v3 Discovery          │
│    · Mobile NPS deep-dive          │
│    → All projects                  │
│    + New project                   │
├────────────────────────────────────┤
│  WORK                              │
│  ✨  Requisor Agent                │
│  🧠  Brain                         │
│  🤖  AI Agents              [Hub]  │
├────────────────────────────────────┤
│                                    │
│             (spacer)               │
│                                    │
├────────────────────────────────────┤
│  ┌── Usage ── Starter ──┐          │
│  │ ⚡ Tokens   12k/50k  │          │
│  │ ▰▰▰▱▱▱▱▱▱▱           │          │
│  │ 📁 Projects  2/5     │          │
│  │ ▰▰▰▰▱▱▱▱▱▱           │          │
│  │ [ Upgrade Plan ]     │          │
│  └──────────────────────┘          │
├────────────────────────────────────┤
│  (•) Erin Wilson                ▸  │
└────────────────────────────────────┘
```

### 4.3 Wireframe — bottom utility expanded

```
├────────────────────────────────────┤
│  (•) Erin Wilson                ▾  │
│      💳  Pricing                   │
│      👥  Team                      │
│      🛒  Agent Marketplace         │
│      ⚙️   Settings                 │
│      🪪  Profile                   │
│      ↪   Sign out                  │
└────────────────────────────────────┘
```

### 4.4 Wireframe — collapsed (icons only)

```
┌──────┐
│ [⌂]  │  logo
│  »   │  expand
├──────┤
│ 📁   │  Projects   (click → flyout panel with search + recents)
├──────┤
│ ✨   │  Requisor Agent
│ 🧠   │  Brain
│ 🤖   │  AI Agents
├──────┤
│      │  (spacer)
├──────┤
│ ⚡   │  Usage (mini ring)
│ (•)  │  User (click → flyout with Pricing/Team/Settings/Profile/Marketplace/Sign out)
└──────┘
```

In collapsed mode, both the Projects section and the bottom utility section render as a single icon that opens a small flyout panel on hover/click — same pattern we already use for the usage ring.

### 4.5 Projects-on-sidebar interaction

- The current project is the default selected one and is the top item, with a colored dot/avatar.
- A search field below filters the recent list. With <10 projects, the full list shows; with more, "Recent (5)" + "All projects" link.
- Clicking a project switches global project context (same behavior as today's `/projects/:id` navigation, just initiated from the sidebar) and *does not* navigate the user away from the page they were on if the page is project-scoped (Brain, Agent, AI Agents). If the user is on a global page (Pricing, Settings), it sends them to that project's Brain.
- "+ New project" opens the existing create-project flow.
- On mobile: the section is collapsed by default and behaves as a sheet rather than an inline accordion.

---

## 5. Inside the unified "Brain" surface

Brain replaces three current pages: Meetings, Evidence Library, Context Brain. It does *not* replace Forms (see §5.4).

### 5.1 Page IA — tabs across the top

```
┌─ Brain ───────────────────────────────────────────────────────┐
│ [ Inbox ] [ Library ] [ Insights ] [ Meetings ] [ Sources ]  │
│                                                               │
│ Filters:  Source ▾   Tag ▾   Project ▾   Date ▾   🔎 search   │
│                                                               │
│ … view-specific content …                                     │
└───────────────────────────────────────────────────────────────┘
```

Five tabs, in order:

1. **Inbox** *(new)* — newly arrived/unprocessed items: fresh transcripts, just-uploaded files, unparsed pastes. Replaces the "where do I drop this?" confusion. Default landing tab when there is anything new; otherwise opens to Insights.
2. **Library** — the current Evidence Library grid (notes, transcripts, files, usage data) with its source/tag filters. Same component as today's `/evidence`.
3. **Insights** — the current Context Brain view: problems / features / decisions / insights / questions, AI-extracted. Same component as today's `/brain`.
4. **Meetings** — the current Meetings list and integration panels (Teams / Google Meet / Zoom / Slack). Same component as today's `/meetings`. Crucially, transcripts captured here automatically appear under Library and feed Insights — we tell the user this in copy at the top of the tab.
5. **Sources** — connection management for Teams / Google Meet / Zoom / Slack / ChatGPT export / Claude export. Today this is scattered inside Meetings and the Brain "Add Context" modal; consolidating it is a small but real UX win.

### 5.2 Why tabs (not sections, not filters)

- **Tabs** preserve each existing page's component as-is, which makes the migration cheap (route + nav swap, not a rewrite).
- **Sections on one scroll** would force a giant page and lose the focused workflows users already know.
- **Filters only** (one big list) loses the "Meetings is for capturing, Brain is for reading" distinction and would be a bigger UX regression.

### 5.3 Cross-tab affordances

- A persistent "Add" button (top right of Brain) with a dropdown: Add note, Paste transcript, Upload file, Import usage data, Add context (ChatGPT/Claude). This collapses the four "add" buttons that exist today across three different pages.
- A persistent project filter so the whole surface is scoped to the active project.
- Empty states across all tabs cross-link to each other ("No insights yet — capture a meeting or upload notes").

### 5.4 What about Forms?

**Recommendation: keep Forms separate, demote it.** Reasoning:

- Forms is public-facing data *capture* (event inquiry intake) — its job is to collect external responses, not to hold internal research artifacts.
- Putting Forms inside Brain would dilute the "this is your research surface" meaning.
- Forms' user is often a different persona (event ops / sales) than the research/PM persona.
- However, Forms *responses* could optionally be ingestable into Brain's Library (as a future enhancement, not in this restructure).

Where Forms should live: under the bottom utility section, next to Team (workspace-level data tooling). If we believe Forms warrants more visibility, we can add it as a sub-item of "Agent Marketplace" or keep it as its own item in the bottom collapsible — the design supports either. **Default recommendation: Forms moves into the bottom utility section as its own item, below Team.**

---

## 6. AI Agents — what to do with it

Three options considered:

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| **A. Keep as top-level "AI Agents"** | Status quo. | No disruption. | Continues to confuse users vs. Requisor Agent. |
| **B. Demote to bottom: "Agent Marketplace"** | Move into the collapsed bottom utility section, rename to "Agent Marketplace". | Resolves the parallel-product confusion. Frees a top-level slot. Matches Erin's intuition. | Discoverability drops; a user who has never opened it may not find it. Slightly devalues the agents we have built. |
| **C. Integrate into Requisor Agent** | Surface other agents as `/agents/sociasor` etc., picked from inside the chat. | Strongest single-entry-point story. | Largest design + code lift, and the agents today are not yet conversational in the same way; would force a rebuild. |

**Recommendation: a hybrid of A and B.**

- **Keep AI Agents as a top-level "Work" item for now**, because we still want users to discover the specialized agents and several of them (Sociasor, Prioritisor, Datasor) are real workflows with distinct UIs.
- **Also expose it from the bottom section as "Agent Marketplace"** — same destination, two entries — so the bottom section's mental model ("everything cross-cutting lives here") is consistent.
- **Plan a follow-up** to do option C properly once the chat-first surface is mature enough to host other agents inline. Mark that as a separate, future task — *not* part of this restructure.

If we have to pick one and only one entry point in v1, choose top-level "AI Agents" and skip the bottom-section duplicate. The duplicate is a nice-to-have, not a must.

---

## 7. Migration impact

### 7.1 Routes

| Current route | New behavior | Notes |
| --- | --- | --- |
| `/` | unchanged (Requisor Agent) | |
| `/meetings` | redirect → `/brain?tab=meetings` | Keep alias for 90 days; existing in-app and email links will keep working. |
| `/evidence` | redirect → `/brain?tab=library` | Same. |
| `/brain` | becomes the unified surface; `?tab=insights` is the default when Inbox is empty | Reuses existing route. |
| `/brain?tab=inbox\|library\|insights\|meetings\|sources` | new query params drive tab selection | |
| `/projects`, `/projects/:id` | unchanged for now | Sidebar Projects section is the new primary entry, but the page stays. |
| `/ai-agents` | unchanged | Optional duplicate entry from bottom utility. |
| `/forms` | unchanged route, just moved in nav | |
| `/pricing`, `/team`, `/settings`, `/profile`, `/token-usage` | unchanged routes; moved into bottom utility nav | |
| `/workflow-builder`, `/agile-planning`, `/jira-*`, `/social-media-agent`, `/prioritisor-*`, `/foodisaur-*`, `/rga-*`, `/smart-bandwidth*`, `/ai-budget-agent` | unchanged; reachable from AI Agents hub | These are already not in the sidebar. |

No data migrations are required: Meetings, Evidence, and Brain already share the underlying evidence-item data model. We are only changing how it is *presented*.

### 7.2 What gets renamed in the UI

- Sidebar entry "Context Brain" → removed (rolled into "Brain").
- Sidebar entry "Meetings" → removed (rolled into "Brain"; tab inside).
- Sidebar entry "Evidence Library" → removed (rolled into "Brain"; tab inside).
- Sidebar entry "Forms" → moved into bottom utility.
- Sidebar entry "Pricing" → moved into bottom utility.
- Sidebar entry "Team" → moved into bottom utility.
- New: "Projects" collapsible section at top.
- New: "Brain" top-level.
- New: bottom utility user-name pill (collapses Pricing/Team/Settings/Profile/Forms/Agent Marketplace/Sign out).

### 7.3 Phased build plan (T-shirt sizes)

| Phase | Deliverable | Size | Why this size |
| --- | --- | --- | --- |
| **P1 — Sidebar shell** | New sidebar component: Projects collapsible (top), reduced top-level "Work" list (Requisor Agent, Brain, AI Agents), bottom utility section condensed-by-default with user pill. Mobile drawer behavior. Collapsed-icon flyouts. | **M** | New layout primitives + a couple of flyouts; reuses existing nav items and links. |
| **P2 — Brain unified surface** | Wrap existing Meetings, Evidence, Brain pages as tabs inside `/brain`. Add the persistent "Add" dropdown and project filter. Add `?tab=` query support. Add 301-style redirects from `/meetings` and `/evidence`. | **M** | Mostly composition over existing components; care needed for shared filters/state and to avoid double-renders. |
| **P3 — Inbox + Sources tabs** | Build the "Inbox" tab (recent unprocessed items list) and the consolidated "Sources" tab (move integration panels out of Meetings). | **M** | Real new UI but small in surface area. |
| **P4 — Polish + telemetry** | Empty states across tabs, cross-links, copy passes, tour update, analytics events on the new nav. | **S** | Tweaks. |
| **P5 — Optional Marketplace duplicate** | Add "Agent Marketplace" entry into the bottom utility flyout. | **XS** | One menu item. |

Recommended sequencing: P1 → P2 in the same sprint (they reinforce each other), then P3, then P4, then P5 if we still want it.

Total rough effort: ~2 sprints for a polished v1 (P1–P4), assuming one fullstack engineer + design support.

---

## 8. Open questions and risks

### 8.1 Open questions for the next planning round

1. **Default landing for Brain** — when both Inbox and Insights have content, which tab opens first? Proposal: Inbox if it has anything ≤ 24h old, else Insights. Needs PM call.
2. **Project scope vs. workspace scope on Brain** — should the Library tab default to "current project only" or "all projects"? Current Evidence Library is workspace-scoped. Proposal: keep workspace-scoped by default, add a project filter chip pre-selected to the current project. Needs validation with Erin.
3. **Settings vs. Profile** — these are two separate pages today and most users do not know the difference. Should this restructure also collapse them into one? Out of scope here, but worth flagging.
4. **Forms placement** — bottom utility (default proposal) or top-level keepsake? If sales/ops users complain about discoverability, we may need to revisit.
5. **AI Agents naming** — if we keep it top-level, do we rename it ("Agents", "Specialists") to read less like a duplicate of Requisor Agent? Proposal: keep "AI Agents" for v1, revisit after telemetry.
6. **Build Mode entry** — confirmed it stays inside Requisor Agent and does not get a sidebar slot? Assumed yes.
7. **Past Discoveries** — the Past Discoveries task is parallel to this. Where does its surface live — inside Brain (as a sub-tab of Insights or its own tab), inside Requisor Agent, or as its own item? Recommendation: a "Past Discoveries" tab inside Brain, but the Past Discoveries task should make that call.

### 8.2 Risks

- **Muscle memory** — power users (including Erin) currently click "Meetings" by reflex. Mitigation: redirects + a one-time inline tooltip on first visit ("Meetings is now a tab inside Brain").
- **Tab proliferation** — five tabs on Brain is the upper bound of comfortable. If we add more, we need sub-nav, not more tabs.
- **Mobile** — five tabs do not fit on a phone. Mitigation: tabs become a horizontally scrollable pill list on mobile, same pattern we already use elsewhere.
- **Bottom-utility collapsed by default** — first-time users may miss Pricing/Settings entirely. Mitigation: expand-by-default the first time a user lands post-restructure, then remember the collapsed state.
- **AI Agents demotion (if we ever do it)** — risks signaling that the marketplace is deprioritized. Mitigation: only do it once telemetry shows the duplicate is unused, or once we ship option C.
- **Onboarding tour** — the tour currently points at sidebar items by `data-tour` attributes. P1 must update those attributes/targets or the tour will break silently.
- **Search/SEO of in-app links** — internal docs, team Slack, and email digests reference `/meetings` and `/evidence`. Redirects must stay live for at least 90 days.

---

## 9. Summary — the one-pager

- **Rename the unified surface "Brain"** and put Meetings, Evidence, Insights, Sources, and a new "Inbox" inside it as tabs.
- **Sidebar order**: Projects (collapsible, top) → Requisor Agent → Brain → AI Agents → spacer → Usage card → User (collapsible bottom utility containing Pricing, Team, Forms, Settings, Profile, Agent Marketplace, Sign out).
- **AI Agents stays top-level** for v1. Optionally also exposed as "Agent Marketplace" in the bottom utility. Defer full integration into Requisor Agent to a future task.
- **Forms moves to the bottom utility** as a workspace-level tool, separate from research synthesis.
- **No data migration** required. Routes redirect; underlying components are reused.
- **Estimated effort**: ~2 sprints for P1–P4, one fullstack engineer + design.
- **Decision needed before build**: Brain default tab, project-scope default on Library, Forms placement, whether to ship the Agent Marketplace duplicate in v1, where Past Discoveries lives.

---

## 10. Addendum — Sidebar v1 cut-scope (shipped under task #18)

After review, the user (Naveen) approved a **deliberately narrowed v1** that ships only the sidebar restructure (P1 in §7.3) and explicitly defers the Brain unified surface (P2). What follows documents what actually shipped in this task and the five resolutions agreed in plan-mode.

### 10.1 What shipped

Sidebar reorganized into three sections (top → bottom):

1. **Projects** — collapsible. Header pill shows the active project (when on `/projects/:id`), then a search input ("Switch project…"), recent project list (all projects when fewer than 10, else top 5 by `lastOpenedAt`), an "All projects" link, and a "New project" link to `/create-project`. Default state: expanded for users with 0–1 projects, collapsed for 2+. User's manual toggle persists in `localStorage["requisor:sidebar_projects_expanded"]`.
2. **Work** — always visible. Three items in this order: **Requisor Agent** (`/`), **Brain** (`/brain`), **AI Agents** (`/ai-agents`, with "Hub" badge).
3. **Bottom utility** — sits below the existing Usage card. Collapsed by default (single user pill). Expands inline to: Pricing, Team, Forms, **Meetings (temporary)**, Settings, Profile, Sign out. State persists in `localStorage["requisor:sidebar_utility_expanded"]`. First post-deploy visit defaults to expanded via `localStorage["requisor:sidebar_v2_seen"]`.

Removed from the sidebar entirely: the old top-level entries for Meetings, Evidence Library, Context Brain, Forms, Pricing, Team, and Projects (as a single nav item). The pages and routes themselves are untouched.

### 10.2 The five resolutions baked in

These were debated in plan mode and agreed before any code changed:

1. **Project switching is navigation-only for v1.** There is no global "current project" state in the codebase; clicking a project in the new section navigates to `/projects/:id` and updates `lastOpenedAt`. The active-project pill is derived from the URL. The richer "stay on current page with new project active" behavior is deferred until a global project context exists.
2. **Collapsed-mode flyouts use shadcn `Popover`.** The spec said "reuse the existing flyout pattern" but the sidebar didn't have one (the collapsed Usage indicator is just a `<Link>` with a `title` tooltip). Popover is already used elsewhere in the app.
3. **Meetings stays in the bottom utility as a temporary entry.** Removing Meetings from navigation entirely with no Brain unification yet would have stranded existing users (Erin in particular). Meetings will be removed from the bottom utility once P2 (Brain unified surface) ships.
4. **Onboarding tour pruned.** The `sidebar-meetings` and `sidebar-evidence` steps were removed from `OnboardingTour.tsx`. The `sidebar-projects` step was retargeted at the new Projects section header and its copy updated to describe switching/creating projects.
5. **`/brain` page header renamed "Context Brain" → "Brain"** for consistency with the sidebar label. Single-line cosmetic change; no other page contents touched.

### 10.3 What v1 explicitly does NOT do

Same boundaries as the cut-scope spec: no Brain/Meetings/Evidence unification, no Inbox tab, no Sources tab, no Agent Marketplace duplicate, no new database tables/endpoints/data models, no changes to `/pricing`, `/team`, `/forms`, `/settings`, `/profile`, `/meetings`, or `/evidence` page contents, no changes to the Requisor Agent chat behavior, no changes to the Usage indicator card.

### 10.4 Files touched

- `client/src/components/layout/Sidebar.tsx` — added `SidebarProjectsSection` and `SidebarBottomUtility` subcomponents; rewrote main nav block; replaced bottom user section; removed dead commented-out user section. The `SidebarUsageIndicator` and `SidebarItem` helpers are unchanged.
- `client/src/components/onboarding/OnboardingTour.tsx` — removed two tour steps; rewrote one.
- `client/src/pages/brain.tsx` — header label only.

### 10.5 Follow-ups

- **P2 — Brain unified surface** (still the next task to schedule). Once it lands, remove Meetings from the bottom utility (per resolution 3).
- **Global project context** — small follow-up to introduce a `useActiveProject` hook backed by `localStorage` so workspace-scoped pages (`/`, `/brain`, `/ai-agents`) can become project-aware without route changes. Required before resolution 1 can be revisited.
- **Settings vs. Profile consolidation** — flagged in §8.1 question 3; still open.
