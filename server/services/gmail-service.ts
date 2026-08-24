/**
 * Gmail integration service (Task #84).
 *
 * Handles the Gmail-specific OAuth flow + message ingestion. Kept separate
 * from `meeting-integrations.ts` because Gmail isn't a meeting/transcript
 * source — it pulls emails (with attachments) into the Conversations Hub.
 *
 * Uses its OWN Google OAuth client (`GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`)
 * so it can be administered independently from Google Meet, which keeps using
 * the shared `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Scopes requested:
 * `gmail.readonly` + `userinfo.email` + `userinfo.profile` + `openid`.
 */

export function hasGmailOAuthConfig(): boolean {
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET);
}

import { ObjectStorageService } from "../objectStorage";
import type { ConversationAttachment } from "@shared/schema";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
].join(" ");

// Cap to keep imports snappy and avoid heap pressure on first-time syncs.
// Each message body + attachments is loaded fully into memory.
const MAX_MESSAGES_PER_IMPORT = 25;

// Attachments larger than this are recorded in metadata only (no object-
// storage upload). Matches the audio persistence guard's spirit.
const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// Cumulative per-import cap across ALL attachments in this batch. Beyond this
// budget the import keeps running but oversize attachments are recorded as
// metadata-only so we don't blow heap or object-storage cost.
const IMPORT_TOTAL_BYTES_BUDGET = 250 * 1024 * 1024; // 250 MB

export interface GmailImport {
  externalId: string; // "gmail:<messageId>"
  messageId: string; // raw Gmail id (without the "gmail:" prefix), for per-result reporting
  title: string;
  content: string;
  participants: string[];
  meetingDate: Date | null;
  threadId: string | null;
  attachments: ConversationAttachment[];
  // Structured headers persisted to conversations.metadata so downstream
  // surfaces (UI badges, Context Brain, exports) can read them without
  // re-parsing the body.
  headers: {
    from: string;
    to: string;
    cc: string;
    subject: string;
    date: string;
    messageId: string;
    threadId: string | null;
    gmailLabels: string[];
  };
  // Raw RFC-822-style headers+body we hand to `normalizeConversation({kind:'email'})`
  // so the shared ingestion pipeline owns the final shape.
  rawEml: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
}

export interface GmailMessageMeta {
  id: string;
  threadId: string | null;
  from: string;
  subject: string;
  snippet: string;
  date: string | null;
  hasAttachments: boolean;
}

function clientId() {
  return process.env.GMAIL_CLIENT_ID || "";
}
function clientSecret() {
  return process.env.GMAIL_CLIENT_SECRET || "";
}

export function getGmailAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(
      `Gmail OAuth error: ${data.error} - ${data.error_description || "no description"}`,
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function refreshGmailToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn?: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Gmail refresh error: ${data.error}`);
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

// Decode Gmail's URL-safe base64 (RFC 4648 §5).
function decodeBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

// Pull text/plain (preferred) or text/html (stripped) out of the MIME tree.
function extractBody(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data).toString("utf8");
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    const html = decodeBase64Url(part.body.data).toString("utf8");
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
  if (part.parts && part.parts.length > 0) {
    // Prefer text/plain anywhere in the subtree.
    for (const sub of part.parts) {
      if (sub.mimeType === "text/plain") {
        const t = extractBody(sub);
        if (t) return t;
      }
    }
    for (const sub of part.parts) {
      const t = extractBody(sub);
      if (t) return t;
    }
  }
  return "";
}

// Walk the MIME tree collecting parts that look like attachments
// (filename present + attachmentId present in body).
function collectAttachmentParts(
  part: GmailPart | undefined,
  out: GmailPart[] = [],
): GmailPart[] {
  if (!part) return out;
  if (part.filename && part.body?.attachmentId) {
    out.push(part);
  }
  if (part.parts) {
    for (const sub of part.parts) collectAttachmentParts(sub, out);
  }
  return out;
}

function parseAddresses(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      // "Name <email@example.com>" → "Name" if present, else email
      const m = entry.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
      if (m) return m[1].trim() || m[2].trim();
      return entry;
    });
}

async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer | null> {
  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: string };
    if (!data.data) return null;
    return decodeBase64Url(data.data);
  } catch (err) {
    console.error(
      `Gmail attachment download failed (msg=${messageId}, att=${attachmentId}):`,
      err,
    );
    return null;
  }
}

/**
 * List recent messages (default: most recent inbox emails) and normalize them
 * into ConversationImport-shaped records ready for `storage.createConversation`.
 *
 * Attachments are uploaded to object storage as they're downloaded so they
 * survive Gmail token expiry. The returned `externalId` is used by the caller
 * to skip messages that have already been imported.
 */
export async function fetchGmailMessages(
  accessToken: string,
  opts: { query?: string; max?: number; bytesBudget?: { remaining: number } } = {},
): Promise<GmailImport[]> {
  const max = Math.min(opts.max ?? MAX_MESSAGES_PER_IMPORT, MAX_MESSAGES_PER_IMPORT);
  const q = opts.query ?? "in:inbox -category:promotions -category:social";

  const listUrl =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?` +
    new URLSearchParams({ q, maxResults: String(max) }).toString();

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    const body = await listRes.text();
    throw new Error(
      `Gmail list failed: ${listRes.status} ${body.slice(0, 200)}`,
    );
  }
  const listData = (await listRes.json()) as {
    messages?: { id: string; threadId: string }[];
  };
  const refs = listData.messages || [];
  if (refs.length === 0) return [];

  const objectStorage = new ObjectStorageService();
  const results: GmailImport[] = [];

  for (const ref of refs) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!msgRes.ok) continue;
      const msg = (await msgRes.json()) as GmailMessage;

      const headers = msg.payload?.headers || [];
      const subject = headerValue(headers, "Subject") || "(no subject)";
      const from = headerValue(headers, "From");
      const to = headerValue(headers, "To");
      const cc = headerValue(headers, "Cc");
      const date = headerValue(headers, "Date");

      const body =
        extractBody(msg.payload) || msg.snippet || "";

      const participants = Array.from(
        new Set([
          ...parseAddresses(from),
          ...parseAddresses(to),
          ...parseAddresses(cc),
        ]),
      );

      let meetingDate: Date | null = null;
      if (msg.internalDate) {
        meetingDate = new Date(parseInt(msg.internalDate, 10));
      } else if (date) {
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) meetingDate = parsed;
      }

      // Attachments: download → upload to object storage (one at a time, with
      // a size guard). We never block the import on a single failure.
      const attachmentParts = collectAttachmentParts(msg.payload);
      const attachments: ConversationAttachment[] = [];
      for (const part of attachmentParts) {
        const filename = part.filename || "attachment";
        const mimeType = part.mimeType || "application/octet-stream";
        const size = part.body?.size || 0;
        if (size > ATTACHMENT_MAX_BYTES) {
          attachments.push({ filename, mimeType, size });
          continue;
        }
        // Per-import cumulative budget guard. Once exhausted we keep listing
        // attachments as metadata-only so the user still sees the filename.
        if (opts.bytesBudget && opts.bytesBudget.remaining < size) {
          attachments.push({ filename, mimeType, size });
          continue;
        }
        const attId = part.body?.attachmentId;
        if (!attId) {
          attachments.push({ filename, mimeType, size });
          continue;
        }
        const buf = await downloadAttachment(accessToken, msg.id, attId);
        if (!buf) {
          attachments.push({ filename, mimeType, size });
          continue;
        }
        // Defense-in-depth: enforce both caps on the *actual* downloaded
        // bytes too, in case Gmail's reported `body.size` underreports.
        if (
          buf.length > ATTACHMENT_MAX_BYTES ||
          (opts.bytesBudget && opts.bytesBudget.remaining < buf.length)
        ) {
          attachments.push({ filename, mimeType, size: buf.length });
          continue;
        }
        try {
          const objectPath = await objectStorage.uploadMediaBuffer(buf, mimeType);
          attachments.push({
            filename,
            mimeType,
            size: buf.length,
            objectPath,
          });
          if (opts.bytesBudget) opts.bytesBudget.remaining -= buf.length;
        } catch (e) {
          console.warn(
            `Gmail attachment upload to object storage failed for ${filename}:`,
            e,
          );
          attachments.push({ filename, mimeType, size: buf.length });
        }
      }

      // Build a human-readable content string. Keep the headers up top so the
      // AI summarizer/Context Brain has context (sender, recipients, date) and
      // doesn't treat the body as a free-floating note.
      const header = [
        `From: ${from}`,
        to ? `To: ${to}` : "",
        cc ? `Cc: ${cc}` : "",
        date ? `Date: ${date}` : "",
        `Subject: ${subject}`,
      ]
        .filter(Boolean)
        .join("\n");
      const content = `${header}\n\n${body}`.trim();

      results.push({
        externalId: `gmail:${msg.id}`,
        messageId: msg.id,
        title: subject,
        content,
        participants,
        meetingDate,
        threadId: msg.threadId ?? null,
        attachments,
        headers: {
          from,
          to,
          cc,
          subject,
          date,
          messageId: headerValue(headers, "Message-ID") || msg.id,
          threadId: msg.threadId ?? null,
          gmailLabels: (msg as any).labelIds || [],
        },
        rawEml: content,
      });
    } catch (err) {
      console.error(`Gmail message fetch failed for ${ref.id}:`, err);
    }
  }

  return results;
}

/**
 * Fetch a specific set of Gmail message ids by id (used by the picker UI's
 * "import selected messages" path). Mirrors fetchGmailMessages but skips the
 * search/list step.
 */
export async function fetchGmailMessagesByIds(
  accessToken: string,
  messageIds: string[],
  opts: { bytesBudget?: { remaining: number } } = {},
): Promise<GmailImport[]> {
  const capped = messageIds.slice(0, MAX_MESSAGES_PER_IMPORT);
  if (capped.length === 0) return [];
  // Reuse fetchGmailMessages's per-message loop by faking a list-result of refs.
  // We do this by calling Gmail directly for each id (the list step is the
  // only difference, so we duplicate the body here for clarity).
  const objectStorage = new ObjectStorageService();
  const results: GmailImport[] = [];
  for (const id of capped) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!msgRes.ok) continue;
      const msg = (await msgRes.json()) as GmailMessage;
      const headers = msg.payload?.headers || [];
      const subject = headerValue(headers, "Subject") || "(no subject)";
      const from = headerValue(headers, "From");
      const to = headerValue(headers, "To");
      const cc = headerValue(headers, "Cc");
      const date = headerValue(headers, "Date");
      const body = extractBody(msg.payload) || msg.snippet || "";
      const participants = Array.from(
        new Set([
          ...parseAddresses(from),
          ...parseAddresses(to),
          ...parseAddresses(cc),
        ]),
      );
      let meetingDate: Date | null = null;
      if (msg.internalDate) {
        meetingDate = new Date(parseInt(msg.internalDate, 10));
      } else if (date) {
        const p = new Date(date);
        if (!isNaN(p.getTime())) meetingDate = p;
      }
      const attachmentParts = collectAttachmentParts(msg.payload);
      const attachments: ConversationAttachment[] = [];
      for (const part of attachmentParts) {
        const filename = part.filename || "attachment";
        const mimeType = part.mimeType || "application/octet-stream";
        const size = part.body?.size || 0;
        if (size > ATTACHMENT_MAX_BYTES) {
          attachments.push({ filename, mimeType, size });
          continue;
        }
        if (opts.bytesBudget && opts.bytesBudget.remaining < size) {
          attachments.push({ filename, mimeType, size });
          continue;
        }
        const attId = part.body?.attachmentId;
        if (!attId) {
          attachments.push({ filename, mimeType, size });
          continue;
        }
        const buf = await downloadAttachment(accessToken, msg.id, attId);
        if (!buf) {
          attachments.push({ filename, mimeType, size });
          continue;
        }
        if (
          buf.length > ATTACHMENT_MAX_BYTES ||
          (opts.bytesBudget && opts.bytesBudget.remaining < buf.length)
        ) {
          attachments.push({ filename, mimeType, size: buf.length });
          continue;
        }
        try {
          const objectPath = await objectStorage.uploadMediaBuffer(buf, mimeType);
          attachments.push({ filename, mimeType, size: buf.length, objectPath });
          if (opts.bytesBudget) opts.bytesBudget.remaining -= buf.length;
        } catch (e) {
          attachments.push({ filename, mimeType, size: buf.length });
        }
      }
      const header = [
        `From: ${from}`,
        to ? `To: ${to}` : "",
        cc ? `Cc: ${cc}` : "",
        date ? `Date: ${date}` : "",
        `Subject: ${subject}`,
      ]
        .filter(Boolean)
        .join("\n");
      const content = `${header}\n\n${body}`.trim();
      results.push({
        externalId: `gmail:${msg.id}`,
        messageId: msg.id,
        title: subject,
        content,
        participants,
        meetingDate,
        threadId: msg.threadId ?? null,
        attachments,
        headers: {
          from,
          to,
          cc,
          subject,
          date,
          messageId: headerValue(headers, "Message-ID") || msg.id,
          threadId: msg.threadId ?? null,
          gmailLabels: (msg as any).labelIds || [],
        },
        rawEml: content,
      });
    } catch (err) {
      console.error(`Gmail message fetch failed for ${id}:`, err);
    }
  }
  return results;
}

/**
 * List the user's Gmail labels (system labels + user labels), so the picker
 * UI can offer label-scoped imports (e.g. "Updates", a custom label, etc.).
 */
export async function listGmailLabels(
  accessToken: string,
): Promise<GmailLabel[]> {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Gmail labels failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    labels?: { id: string; name: string; type?: string }[];
  };
  return (data.labels || []).map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
  }));
}

/**
 * Lightweight metadata-only listing used by the picker UI. We only request the
 * headers we render (From/Subject/Date), so this is cheap relative to the full
 * fetch in fetchGmailMessages.
 */
export async function listGmailMessageMetadata(
  accessToken: string,
  opts: {
    query?: string;
    labelIds?: string[];
    max?: number;
    pageToken?: string;
  } = {},
): Promise<{ messages: GmailMessageMeta[]; nextPageToken: string | null }> {
  const max = Math.min(opts.max ?? 25, 100);
  const params = new URLSearchParams({ maxResults: String(max) });
  if (opts.query) params.set("q", opts.query);
  if (opts.pageToken) params.set("pageToken", opts.pageToken);
  for (const id of opts.labelIds || []) params.append("labelIds", id);

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) {
    throw new Error(`Gmail message list failed: ${listRes.status}`);
  }
  const listData = (await listRes.json()) as {
    messages?: { id: string; threadId: string }[];
    nextPageToken?: string;
  };
  const refs = listData.messages || [];
  const out: GmailMessageMeta[] = [];
  for (const ref of refs) {
    try {
      const url =
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}` +
        `?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) continue;
      const m = (await r.json()) as GmailMessage & {
        labelIds?: string[];
      };
      const headers = m.payload?.headers || [];
      const hasAtt =
        collectAttachmentParts(m.payload).length > 0 ||
        (m as any).labelIds?.includes("HAS_ATTACHMENT");
      out.push({
        id: m.id,
        threadId: m.threadId ?? null,
        from: headerValue(headers, "From"),
        subject: headerValue(headers, "Subject") || "(no subject)",
        snippet: m.snippet || "",
        date: headerValue(headers, "Date") || null,
        hasAttachments: !!hasAtt,
      });
    } catch (e) {
      // skip on individual failure
    }
  }
  return { messages: out, nextPageToken: listData.nextPageToken ?? null };
}
