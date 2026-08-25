import crypto from "node:crypto";

const DISCORD_API = "https://discord.com/api/v10";

// Legacy AES-256-GCM helpers retained so the older
// /api/conversations/discord/* per-user-bot-token endpoints continue to
// compile and decrypt any tokens already in the DB. New code should use
// the OAuth bot-invite flow below (no per-user token storage).
const ENC_KEY = (() => {
  const seed = process.env.DISCORD_TOKEN_KEY || process.env.SESSION_SECRET;
  if (!seed || seed.length < 16) return null;
  return crypto.createHash("sha256").update(seed).digest();
})();
const ENC_PREFIX = "enc:v1:";

export function encryptToken(token: string): string {
  if (!ENC_KEY) {
    throw new Error(
      "Discord legacy token encryption requires DISCORD_TOKEN_KEY or SESSION_SECRET (>= 16 chars).",
    );
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  if (!ENC_KEY) return stored;
  const buf = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function getBotToken(): string {
  const t = process.env.DISCORD_BOT_TOKEN;
  if (!t) throw new Error("DISCORD_BOT_TOKEN is not configured");
  return t;
}

export function getClientId(): string {
  const c = process.env.DISCORD_CLIENT_ID;
  if (!c) throw new Error("DISCORD_CLIENT_ID is not configured");
  return c;
}

interface DiscordError extends Error {
  status?: number;
  retryAfter?: number;
}

async function discordFetch(
  path: string,
  attempt = 0,
): Promise<any> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bot ${getBotToken()}` },
  });

  if (res.status === 429) {
    const retryAfterHeader = res.headers.get("retry-after");
    let retryAfter = retryAfterHeader ? parseFloat(retryAfterHeader) : 1;
    try {
      const body = await res.clone().json();
      if (typeof body?.retry_after === "number") retryAfter = body.retry_after;
    } catch {}
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, Math.min(retryAfter * 1000, 5000)));
      return discordFetch(path, attempt + 1);
    }
    const err: DiscordError = new Error("Discord rate limit exceeded");
    err.status = 429;
    err.retryAfter = retryAfter;
    throw err;
  }

  if (!res.ok) {
    const err: DiscordError = new Error(
      `Discord API error (${res.status}) for ${path}`,
    );
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
}

/**
 * Lists every guild the global bot is currently a member of.
 * The caller filters this against the user's connected guildIds.
 */
export async function listBotGuilds(): Promise<DiscordGuild[]> {
  const out: DiscordGuild[] = [];
  let after: string | undefined;
  // /users/@me/guilds caps at 200 per page.
  for (let page = 0; page < 10; page++) {
    const path = `/users/@me/guilds?limit=200${after ? `&after=${after}` : ""}`;
    const batch = await discordFetch(path);
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const g of batch) {
      out.push({ id: g.id, name: g.name, icon: g.icon ?? null });
    }
    if (batch.length < 200) break;
    after = batch[batch.length - 1].id;
  }
  return out;
}

export interface DiscordTextChannel {
  id: string;
  name: string;
  type: number;
  topic: string | null;
  parentId: string | null;
}

export async function listTextChannels(
  guildId: string,
): Promise<DiscordTextChannel[]> {
  const all = await discordFetch(`/guilds/${guildId}/channels`);
  return (Array.isArray(all) ? all : [])
    .filter((c: any) => c.type === 0 || c.type === 5)
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      topic: c.topic ?? null,
      parentId: c.parent_id ?? null,
    }));
}

export interface DiscordMessage {
  id: string;
  content: string;
  timestamp: string;
  author: {
    id: string;
    username: string;
    globalName?: string;
    avatar?: string;
  };
}

export async function getChannelGuildId(channelId: string): Promise<string | null> {
  try {
    const c = await discordFetch(`/channels/${channelId}`);
    return c?.guild_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Single page of messages with pagination cursors. Newest-first per Discord;
 * the route handler decides whether to reverse for chronological display.
 */
export async function listMessagesPage(
  channelId: string,
  limit = 50,
  before?: string,
): Promise<DiscordMessage[]> {
  const cap = Math.min(Math.max(limit, 1), 100);
  const path = `/channels/${channelId}/messages?limit=${cap}${
    before ? `&before=${before}` : ""
  }`;
  const batch = await discordFetch(path);
  if (!Array.isArray(batch)) return [];
  return batch.map((m: any) => ({
    id: m.id,
    content: m.content,
    timestamp: m.timestamp,
    author: {
      id: m.author?.id,
      username: m.author?.username,
      globalName: m.author?.global_name,
      avatar: m.author?.avatar,
    },
  }));
}

/**
 * Builds the OAuth bot-invite URL. After the user authorizes the bot into
 * a guild, Discord redirects to redirectUri with `?guild_id=...&permissions=...`.
 */
export function buildBotInviteUrl(opts: {
  redirectUri: string;
  state: string;
  permissions?: string;
}): string {
  // 1024 = View Channels (0x400), 65536 = Read Message History (0x10000)
  const permissions = opts.permissions || "66560";
  const params = new URLSearchParams({
    client_id: getClientId(),
    scope: "bot",
    permissions,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function newOAuthState(): string {
  return crypto.randomBytes(24).toString("hex");
}
