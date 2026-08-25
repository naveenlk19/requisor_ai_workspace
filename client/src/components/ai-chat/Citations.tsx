// Task #94 — Inline citations + Sources footer.
//
// `CitationChip` is the small `[1]` pill rendered inline with prose.
// `SourcesFooter` is the compact list under each AI response.
// `renderWithCitations` wraps ReactMarkdown so `[chunk_id:N]` tokens
// inside the model's text are swapped for chips while keeping the rest
// of the markdown intact (headings, lists, bold, etc.).
//
// Deep-linking goes through `resolveCitationTarget` which returns a
// wouter-compatible URL. Click handling fires `/api/ai/citation-click`
// (fire-and-forget) for telemetry + an ownership re-check before the
// browser navigates.

import { cloneElement, isValidElement, useCallback, useState } from "react";
import { useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Mic,
  Mail,
  FileText,
  Lightbulb,
  Sparkles,
  ExternalLink,
  Brain,
} from "lucide-react";

export interface Citation {
  n: number;
  citationId: string;
  chunkRowId: number;
  sourceType: string;
  sourceId: number;
  chunkIndex: number;
  title: string | null;
  preview: string;
  speaker: string | null;
  startMs: number | null;
  endMs: number | null;
  page: number | null;
  // Task #99 — `"belief"` when this chip represents a consolidated claim
  // rather than a raw chunk. UI swaps to a violet pill with a
  // "claim · N sources" label and a "View sources" expansion.
  via?: string | null;
  belief?: {
    id: number;
    holder: string | null;
    mentionCount: number;
    lastSeenAt: string | null;
    weight: number;
    status: string;
    sourceEmbeddingIds: number[];
  } | null;
}

export type CitationSurface = "brain" | "planner" | "build" | "other";

function iconFor(sourceType: string) {
  if (sourceType === "belief") return Brain;
  if (sourceType === "conversation") return MessageSquare;
  if (sourceType === "meeting" || sourceType === "utterance") return Mic;
  if (sourceType === "email" || sourceType === "gmail") return Mail;
  if (sourceType === "evidence_item" || sourceType === "file") return FileText;
  if (sourceType === "insight") return Lightbulb;
  return Sparkles;
}

function labelFor(c: Citation): string {
  if (c.title) return c.title;
  if (c.sourceType === "belief") return `Belief #${c.sourceId}`;
  return `${c.sourceType.replace(/_/g, " ")} #${c.sourceId}`;
}

function isBeliefCitation(c: Citation): boolean {
  return c.sourceType === "belief" || c.via === "belief";
}

/**
 * Build the deep-link URL for a citation. All Brain Hub surfaces live
 * under `/brain?tab=…&open=…` and the Meetings dialog supports `t=<ms>`
 * to scrub the audio player to a specific utterance.
 */
export function resolveCitationTarget(c: Citation): string {
  const type = c.sourceType;
  const id = c.sourceId;
  // Task #99 — belief chips deep-link to the insights tab with the belief
  // id highlighted; the underlying source chunks are reachable from the
  // chip popover's "View sources" expansion.
  if (type === "belief") {
    return `/brain?tab=insights&belief=${id}`;
  }
  if (type === "conversation" || type === "email" || type === "gmail") {
    // Email lives inside the Conversations tab as a conversation row.
    return `/brain?tab=conversations&open=${id}`;
  }
  if (type === "meeting" || type === "utterance") {
    const t = c.startMs ? `&t=${c.startMs}` : "";
    return `/brain?tab=meetings&open=${id}${t}`;
  }
  if (type === "evidence_item" || type === "file") {
    return `/brain?tab=notes&open=${id}`;
  }
  if (type === "insight") {
    return `/brain?tab=insights&highlight=${id}`;
  }
  return `/brain?tab=insights`;
}

async function logCitationClick(
  c: Citation,
  surface: CitationSurface,
  sessionId?: string | null,
) {
  try {
    // Task #99 — belief clicks carry sourceType + sourceId so the server
    // can validate ownership against the `beliefs` table (the negative-
    // sentinel chunkRowId on belief chunks is not a valid embeddings.id).
    await fetch("/api/ai/citation-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        chunkRowId: c.chunkRowId,
        citationId: c.citationId,
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        surface,
        sessionId: sessionId ?? null,
      }),
    });
  } catch {
    // telemetry only — never block navigation.
  }
}

interface CitationChipProps {
  citation: Citation;
  surface: CitationSurface;
  sessionId?: string | null;
}

export function CitationChip({
  citation,
  surface,
  sessionId,
}: CitationChipProps) {
  const [, setLocation] = useLocation();
  const Icon = iconFor(citation.sourceType);

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void logCitationClick(citation, surface, sessionId);
    setLocation(resolveCitationTarget(citation));
  };

  const isBelief = isBeliefCitation(citation);
  const sourceCount = citation.belief?.sourceEmbeddingIds?.length ?? 0;
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [beliefSources, setBeliefSources] = useState<Citation[] | null>(null);

  // Task #99 — Fetch the underlying chunk metadata on demand. The chip
  // popover renders the resulting rows as mini source cards that route
  // through the same `/brain` deep-links + click telemetry as regular
  // citations.
  const expandBeliefSources = useCallback(async () => {
    if (!isBelief || !citation.belief) return;
    if (sourcesExpanded && beliefSources) {
      setSourcesExpanded(false);
      return;
    }
    setSourcesExpanded(true);
    if (beliefSources) return;
    setSourcesLoading(true);
    setSourcesError(null);
    try {
      const res = await fetch(`/api/ai/belief/${citation.belief.id}/sources`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const mapped: Citation[] = (data.sources || []).map(
        (s: any, idx: number) => ({
          n: idx + 1,
          citationId: `${s.sourceType}:${s.sourceId}:${s.chunkIndex}`,
          chunkRowId: s.chunkRowId,
          sourceType: s.sourceType,
          sourceId: s.sourceId,
          chunkIndex: s.chunkIndex,
          title: s.title ?? null,
          preview: s.preview ?? "",
          speaker: s.speaker ?? null,
          startMs: s.startMs ?? null,
          endMs: null,
          page: s.page ?? null,
          via: null,
          belief: null,
        }),
      );
      setBeliefSources(mapped);
    } catch (err: any) {
      setSourcesError("Couldn't load sources");
      setBeliefSources([]);
    } finally {
      setSourcesLoading(false);
    }
  }, [isBelief, citation.belief, sourcesExpanded, beliefSources]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`citation-chip-${citation.n}`}
          className={cn(
            "inline-flex items-center justify-center align-baseline",
            "h-[18px] min-w-[20px] px-1 mx-0.5 rounded text-[10px] font-semibold",
            "transition-colors cursor-pointer leading-none border",
            isBelief
              ? "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 hover:border-violet-300"
              : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300",
          )}
        >
          {citation.n}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 p-3 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 mb-2">
          <Icon
            className={cn(
              "h-3.5 w-3.5 flex-shrink-0 mt-0.5",
              isBelief ? "text-violet-600" : "text-emerald-600",
            )}
          />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 truncate">
              {labelFor(citation)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">
              {isBelief && citation.belief
                ? `claim · ${citation.belief.mentionCount}× mentions · ${sourceCount} sources`
                : citation.sourceType.replace(/_/g, " ")}
              {!isBelief && citation.speaker && ` · ${citation.speaker}`}
              {!isBelief && citation.page && ` · p${citation.page}`}
              {isBelief && citation.belief?.holder && ` · ${citation.belief.holder}`}
            </div>
          </div>
        </div>
        <p className="text-gray-700 leading-snug line-clamp-4 mb-2">
          {citation.preview || "(no preview available)"}
        </p>
        {isBelief && citation.belief?.lastSeenAt && (
          <p className="text-[10px] text-gray-500 mb-2">
            Last seen {new Date(citation.belief.lastSeenAt).toLocaleDateString()}
          </p>
        )}
        {isBelief ? (
          <div className="space-y-2">
            <button
              type="button"
              data-testid={`citation-belief-expand-${citation.n}`}
              onClick={expandBeliefSources}
              className="inline-flex items-center gap-1 font-medium text-violet-700 hover:text-violet-800"
            >
              {sourcesExpanded
                ? "Hide sources"
                : `View ${sourceCount} sources`}
            </button>
            {sourcesExpanded && (
              <div className="border-t border-violet-100 pt-2 space-y-1.5 max-h-56 overflow-y-auto">
                {sourcesLoading && (
                  <p className="text-[10px] text-gray-500">Loading sources…</p>
                )}
                {sourcesError && (
                  <p className="text-[10px] text-red-600">{sourcesError}</p>
                )}
                {!sourcesLoading &&
                  beliefSources &&
                  beliefSources.length === 0 && (
                    <p className="text-[10px] text-gray-500">
                      No accessible sources for this claim.
                    </p>
                  )}
                {beliefSources?.map((src) => {
                  const SrcIcon = iconFor(src.sourceType);
                  return (
                    <button
                      key={`${src.citationId}-${src.chunkRowId}`}
                      type="button"
                      data-testid={`belief-source-${citation.n}-${src.chunkRowId}`}
                      onClick={() => {
                        void logCitationClick(src, surface, sessionId);
                        setLocation(resolveCitationTarget(src));
                      }}
                      className="w-full flex items-start gap-2 text-left px-1.5 py-1 rounded hover:bg-violet-50 group"
                    >
                      <SrcIcon className="h-3 w-3 text-gray-500 mt-0.5 flex-shrink-0 group-hover:text-violet-600" />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-[11px] font-medium text-gray-800">
                          {labelFor(src)}
                        </span>
                        <span className="block truncate text-[10px] text-gray-500">
                          {src.preview}
                        </span>
                      </span>
                      <ExternalLink className="h-3 w-3 text-gray-300 group-hover:text-violet-600 flex-shrink-0 mt-0.5" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleOpen}
            className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-800"
          >
            Open source <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface SourcesFooterProps {
  citations: Citation[];
  surface: CitationSurface;
  sessionId?: string | null;
}

export function SourcesFooter({
  citations,
  surface,
  sessionId,
}: SourcesFooterProps) {
  const [, setLocation] = useLocation();
  if (!citations || citations.length === 0) return null;

  // Dedupe by citationId — same source cited twice should appear once.
  const seen = new Set<string>();
  const unique = citations.filter((c) => {
    if (seen.has(c.citationId)) return false;
    seen.add(c.citationId);
    return true;
  });

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
        Sources
      </div>
      <div className="space-y-1">
        {unique.map((c) => {
          const Icon = iconFor(c.sourceType);
          return (
            <button
              key={c.citationId}
              type="button"
              data-testid={`source-row-${c.n}`}
              onClick={() => {
                void logCitationClick(c, surface, sessionId);
                setLocation(resolveCitationTarget(c));
              }}
              className={cn(
                "w-full flex items-start gap-2 text-left text-xs px-2 py-1.5 rounded-md",
                "hover:bg-emerald-50/60 transition-colors group",
              )}
            >
              <span className="inline-flex items-center justify-center h-[18px] min-w-[20px] px-1 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0 mt-0.5">
                {c.n}
              </span>
              <Icon className="h-3.5 w-3.5 text-gray-500 flex-shrink-0 mt-1 group-hover:text-emerald-600" />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-gray-800 font-medium">
                  {labelFor(c)}
                </span>
                <span className="block truncate text-gray-500 text-[11px]">
                  {c.preview}
                </span>
              </span>
              <ExternalLink className="h-3 w-3 text-gray-300 group-hover:text-emerald-600 flex-shrink-0 mt-1" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CITATION_RE = /\[chunk_id:(\d+)\]/g;

/**
 * Walk a React children tree replacing `[chunk_id:N]` tokens in text
 * nodes with <CitationChip /> elements. Recursive so it works inside
 * <strong>, <em>, <code>, <li>, etc. Preserves all other nodes intact.
 */
function processChildren(
  children: React.ReactNode,
  citationsByN: Map<number, Citation>,
  surface: CitationSurface,
  sessionId?: string | null,
): React.ReactNode {
  const arr = Array.isArray(children) ? children : [children];
  const out: React.ReactNode[] = [];
  arr.forEach((child, i) => {
    if (typeof child === "string") {
      const parts = child.split(CITATION_RE);
      // split returns [text, num, text, num, …]
      for (let j = 0; j < parts.length; j++) {
        if (j % 2 === 0) {
          if (parts[j]) out.push(parts[j]);
        } else {
          const n = Number(parts[j]);
          const cite = citationsByN.get(n);
          if (cite) {
            out.push(
              <CitationChip
                key={`c-${i}-${j}-${n}`}
                citation={cite}
                surface={surface}
                sessionId={sessionId}
              />,
            );
          }
          // unknown N (verifier-stripped after stream): swallow silently.
        }
      }
    } else if (
      isValidElement(child) &&
      (child as any).props?.children !== undefined
    ) {
      // Use cloneElement so React's internal $$typeof / refs / keys are
      // preserved. Object-spreading an element breaks reconciliation.
      out.push(
        cloneElement(child as any, {
          children: processChildren(
            (child as any).props.children,
            citationsByN,
            surface,
            sessionId,
          ),
        }),
      );
    } else {
      out.push(child);
    }
  });
  return out;
}

interface RenderWithCitationsProps {
  text: string;
  citations: Citation[];
  surface: CitationSurface;
  sessionId?: string | null;
}

/**
 * Drop-in replacement for `<ReactMarkdown>{text}</ReactMarkdown>` that
 * also renders inline citation chips wherever the model emitted
 * `[chunk_id:N]` (and that survived the faithfulness verifier).
 */
export function RenderWithCitations({
  text,
  citations,
  surface,
  sessionId,
}: RenderWithCitationsProps) {
  const citationsByN = new Map<number, Citation>();
  for (const c of citations || []) citationsByN.set(c.n, c);

  const wrap =
    (Tag: keyof JSX.IntrinsicElements) =>
    ({ children, ...rest }: any) => (
      <Tag {...rest}>
        {processChildren(children, citationsByN, surface, sessionId)}
      </Tag>
    );

  return (
    <ReactMarkdown
      components={{
        p: wrap("p"),
        li: wrap("li"),
        h1: wrap("h1"),
        h2: wrap("h2"),
        h3: wrap("h3"),
        h4: wrap("h4"),
        strong: wrap("strong"),
        em: wrap("em"),
        td: wrap("td"),
        th: wrap("th"),
        blockquote: wrap("blockquote"),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
