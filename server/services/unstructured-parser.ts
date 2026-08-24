/**
 * Unstructured.io hosted-API client for hard-to-parse documents.
 *
 * Used as a fallback when our in-house fast parsers (pdf-parse-new, mammoth,
 * pptx2json, xlsx) return weak or empty output — typically scanned PDFs,
 * complex tables, multi-column layouts, and rich PowerPoint decks.
 *
 * Self-host path (future): swap UNSTRUCTURED_API_URL for the local
 * unstructured-api container endpoint (https://github.com/Unstructured-IO/unstructured-api).
 * The wire shape is identical, so no code changes are required.
 */

import fs from "fs";
import path from "path";

const DEFAULT_API_URL =
  process.env.UNSTRUCTURED_API_URL ||
  "https://api.unstructuredapp.io/general/v0/general";

const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes for big OCR jobs

export type UnstructuredElementType =
  | "Title"
  | "NarrativeText"
  | "ListItem"
  | "Table"
  | "Image"
  | "Header"
  | "Footer"
  | "FigureCaption"
  | "Address"
  | "Formula"
  | "PageBreak"
  | "UncategorizedText"
  | string;

export interface UnstructuredElement {
  type: UnstructuredElementType;
  text: string;
  page?: number;
  tableHtml?: string;
}

export interface UnstructuredResult {
  ok: true;
  elements: UnstructuredElement[];
  markdown: string;
  pageCount: number;
  tableCount: number;
  imageCount: number;
}

export interface UnstructuredFailure {
  ok: false;
  reason: string;
}

export function isUnstructuredConfigured(): boolean {
  return !!(process.env.UNSTRUCTURED_API_KEY || "").trim();
}

let warnedMissingKey = false;
export function warnUnstructuredOnceIfMissing(): void {
  if (!isUnstructuredConfigured() && !warnedMissingKey) {
    warnedMissingKey = true;
    console.warn(
      "[Unstructured] UNSTRUCTURED_API_KEY not set — scanned PDFs, complex tables, and rich documents will use fast-path parsers only.",
    );
  }
}

function htmlTableToMarkdown(html: string): string {
  if (!html) return "";
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  const tableHtml = tableMatch ? tableMatch[0] : html;
  const rows = Array.from(tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)).map(
    (m) => m[0],
  );
  if (rows.length === 0) return html.replace(/<[^>]+>/g, " ").trim();

  const parseRow = (row: string): string[] =>
    Array.from(row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)).map((cell) =>
      cell[1]
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\|/g, "\\|"),
    );

  const parsed = rows.map(parseRow).filter((r) => r.length > 0);
  if (parsed.length === 0) return html.replace(/<[^>]+>/g, " ").trim();

  const width = Math.max(...parsed.map((r) => r.length));
  const padded = parsed.map((r) => {
    const out = r.slice();
    while (out.length < width) out.push("");
    return out;
  });

  const header = padded[0];
  const sep = header.map(() => "---");
  const body = padded.slice(1);

  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ];
  return lines.join("\n");
}

function normalizeRawElement(raw: any): UnstructuredElement | null {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "UncategorizedText");
  const text = String(raw.text || "").replace(/\x00/g, "");
  const page =
    raw.metadata && typeof raw.metadata.page_number === "number"
      ? raw.metadata.page_number
      : undefined;
  const tableHtml =
    type === "Table" && raw.metadata && typeof raw.metadata.text_as_html === "string"
      ? raw.metadata.text_as_html
      : undefined;
  if (!text && !tableHtml) return null;
  return { type, text, page, tableHtml };
}

function elementsToMarkdown(elements: UnstructuredElement[]): string {
  const out: string[] = [];
  let lastPage: number | undefined;
  for (const el of elements) {
    if (el.page && el.page !== lastPage) {
      out.push(`\n--- Page ${el.page} ---\n`);
      lastPage = el.page;
    }
    switch (el.type) {
      case "Title":
      case "Header":
        out.push(`\n## ${el.text}\n`);
        break;
      case "ListItem":
        out.push(`- ${el.text}`);
        break;
      case "Table":
        out.push("");
        out.push(
          el.tableHtml ? htmlTableToMarkdown(el.tableHtml) : el.text,
        );
        out.push("");
        break;
      case "Image":
      case "FigureCaption":
        if (el.text) out.push(`*[Figure] ${el.text}*`);
        break;
      case "PageBreak":
      case "Footer":
        break;
      default:
        out.push(el.text);
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Run Unstructured against a file on disk. Returns a normalized result with
 * a markdown rendering (tables as GFM) and element/page counts. On any
 * failure (missing key, HTTP error, timeout), returns `{ ok: false }` — the
 * caller is responsible for falling back to the fast-path parser.
 */
export async function runUnstructured(
  filePath: string,
  fileName: string,
  mimeType: string,
  options: { strategy?: "auto" | "hi_res" | "fast" | "ocr_only" } = {},
): Promise<UnstructuredResult | UnstructuredFailure> {
  const apiKey = (process.env.UNSTRUCTURED_API_KEY || "").trim();
  if (!apiKey) {
    warnUnstructuredOnceIfMissing();
    return { ok: false, reason: "missing_api_key" };
  }

  const strategy = options.strategy || "auto";
  const maxAttempts = 2;
  let lastErr = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const stat = await fs.promises.stat(filePath);
      const fileBuffer = await fs.promises.readFile(filePath);
      const blob = new Blob([fileBuffer], {
        type: mimeType || "application/octet-stream",
      });

      const form = new FormData();
      form.append("files", blob, fileName || path.basename(filePath));
      form.append("strategy", strategy);
      form.append("pdf_infer_table_structure", "true");
      form.append("languages", "eng");
      form.append("coordinates", "false");

      const res = await fetch(DEFAULT_API_URL, {
        method: "POST",
        headers: { "unstructured-api-key": apiKey, accept: "application/json" },
        body: form as any,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastErr = `http_${res.status}: ${body.slice(0, 200)}`;
        // 429/5xx → retry; 4xx (other) → bail.
        if (res.status !== 429 && res.status < 500) {
          return { ok: false, reason: lastErr };
        }
        continue;
      }

      const json = (await res.json()) as any;
      const rawElements: any[] = Array.isArray(json) ? json : [];
      const elements: UnstructuredElement[] = rawElements
        .map(normalizeRawElement)
        .filter((e): e is UnstructuredElement => !!e);

      const pageNums = new Set<number>();
      let tableCount = 0;
      let imageCount = 0;
      for (const el of elements) {
        if (el.page) pageNums.add(el.page);
        if (el.type === "Table") tableCount++;
        if (el.type === "Image") imageCount++;
      }

      const markdown = elementsToMarkdown(elements);
      console.log(
        `[Unstructured] Parsed ${fileName} (${(stat.size / 1024).toFixed(0)} KB) → ${elements.length} elements, ${pageNums.size} pages, ${tableCount} tables (strategy=${strategy})`,
      );

      return {
        ok: true,
        elements,
        markdown,
        pageCount: pageNums.size,
        tableCount,
        imageCount,
      };
    } catch (err: any) {
      lastErr = err?.name === "AbortError" ? "timeout" : String(err?.message || err);
      if (attempt === maxAttempts) {
        return { ok: false, reason: lastErr };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, reason: lastErr || "unknown" };
}
