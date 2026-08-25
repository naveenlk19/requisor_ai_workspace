import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import {
  buildBotInviteUrl,
  newOAuthState,
  listBotGuilds,
  listTextChannels,
  listMessagesPage,
  getChannelGuildId,
  getBotToken,
} from "../services/discord-service";
import { normalizeConversation } from "../services/conversation-parsers";

function getUserId(req: any): string | null {
  return req.user?.dbUserId || req.user?.claims?.sub || null;
}

function originFor(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const host = req.get("host");
  return `${proto}://${host}`;
}

function redirectUriFor(req: Request): string {
  return `${originFor(req)}/api/discord/oauth/callback`;
}

interface DiscordOAuthData {
  guildIds?: string[];
  state?: string;
  connectedAt?: string;
}

async function readMapping(userId: string): Promise<DiscordOAuthData> {
  const integ = await storage.getIntegrationByProvider(userId, "discord_oauth");
  return ((integ?.additionalData as DiscordOAuthData) || {}) as DiscordOAuthData;
}

async function writeMapping(
  userId: string,
  data: DiscordOAuthData,
  isConnected = true,
): Promise<void> {
  const existing = await storage.getIntegrationByProvider(userId, "discord_oauth");
  if (existing) {
    await storage.updateIntegration(existing.id, {
      isConnected,
      additionalData: data,
    });
  } else {
    await storage.createIntegration({
      userId,
      provider: "discord_oauth",
      isConnected,
      additionalData: data,
    });
  }
}

async function userOwnsGuild(userId: string, guildId: string): Promise<boolean> {
  const mapping = await readMapping(userId);
  return (mapping.guildIds || []).includes(guildId);
}

function handleDiscordError(res: Response, err: any) {
  const status = err?.status;
  if (status === 429) {
    return res
      .status(429)
      .json({ error: "Discord rate limit exceeded", retryAfter: err.retryAfter });
  }
  if (status === 401 || status === 403) {
    return res.status(status).json({ error: "Discord rejected the request" });
  }
  console.error("Discord API error:", err?.message || err);
  return res.status(502).json({ error: "Discord API request failed" });
}

export function registerDiscordRoutes(
  app: Express,
  isAuthenticated: any,
): void {
  // Returns the OAuth bot-invite URL for the current user. We persist the
  // CSRF `state` in the user's mapping row so the callback can validate it
  // even though Discord's bot invite uses no shared session there.
  app.get(
    "/api/discord/connect-url",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const state = newOAuthState();
        const existing = await readMapping(userId);
        await writeMapping(
          userId,
          { ...existing, state },
          existing.guildIds && existing.guildIds.length > 0,
        );

        const url = buildBotInviteUrl({
          redirectUri: redirectUriFor(req),
          state: `${userId}:${state}`,
        });
        res.json({ url });
      } catch (err: any) {
        if (err?.message?.includes("DISCORD_")) {
          return res.status(500).json({ error: err.message });
        }
        handleDiscordError(res, err);
      }
    },
  );

  // Discord redirects here after the user authorizes the bot into a guild.
  // Query: ?code=...&state=<userId:rand>&guild_id=...&permissions=...
  app.get(
    "/api/discord/oauth/callback",
    async (req: Request, res: Response) => {
      try {
        const stateParam = String(req.query.state || "");
        const guildId = String(req.query.guild_id || "");
        const [userId, stateNonce] = stateParam.split(":");
        if (!userId || !stateNonce || !guildId) {
          return res
            .status(400)
            .send("Missing state or guild_id from Discord redirect");
        }
        const mapping = await readMapping(userId);
        if (mapping.state !== stateNonce) {
          return res.status(400).send("Invalid OAuth state");
        }
        const guildIds = Array.from(
          new Set([...(mapping.guildIds || []), guildId]),
        );
        // Single-use nonce: clear state after consumption to prevent replay.
        await writeMapping(userId, {
          guildIds,
          connectedAt: new Date().toISOString(),
        });
        // Send the user back into the app.
        res.redirect("/meetings?discord=connected");
      } catch (err: any) {
        console.error("Discord OAuth callback error:", err);
        res.status(500).send("Discord OAuth callback failed");
      }
    },
  );

  // NOTE: We deliberately do NOT expose a manual `POST /api/discord/connect`
  // that accepts a guildId from the request body. Doing so would let any
  // authenticated user self-authorize arbitrary guild IDs and bypass the
  // OAuth bot-invite proof. The only way to add a guild is via the
  // OAuth callback above, which validates a server-issued single-use state.

  // Disconnect a single guild (or all if none given).
  app.post(
    "/api/discord/disconnect",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const { guildId } = (req.body || {}) as { guildId?: string };
        const mapping = await readMapping(userId);
        const guildIds = guildId
          ? (mapping.guildIds || []).filter((g) => g !== guildId)
          : [];
        await writeMapping(
          userId,
          { ...mapping, guildIds },
          guildIds.length > 0,
        );
        res.json({ guildIds });
      } catch (err: any) {
        handleDiscordError(res, err);
      }
    },
  );

  // Returns only the guilds the current user has authorized, hydrated with
  // names from the bot's view of the world. Guilds the bot was kicked from
  // are returned with name=null so the UI can prompt re-invite.
  app.get(
    "/api/discord/guilds",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const mapping = await readMapping(userId);
        const ids = mapping.guildIds || [];
        if (ids.length === 0) return res.json([]);
        const all = await listBotGuilds();
        const byId = new Map(all.map((g) => [g.id, g]));
        const out = ids.map((id) => {
          const g = byId.get(id);
          return {
            id,
            name: g?.name ?? null,
            icon: g?.icon ?? null,
            botPresent: !!g,
          };
        });
        res.json(out);
      } catch (err: any) {
        handleDiscordError(res, err);
      }
    },
  );

  app.get(
    "/api/discord/channels/:guildId",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const { guildId } = req.params;
        if (!guildId) return res.status(400).json({ error: "guildId is required" });
        if (!(await userOwnsGuild(userId, guildId))) {
          return res
            .status(403)
            .json({ error: "You haven't authorized the bot in that server" });
        }
        const channels = await listTextChannels(guildId);
        res.json(channels);
      } catch (err: any) {
        handleDiscordError(res, err);
      }
    },
  );

  // Imports a channel's recent messages (paginated up to ~maxMessages)
  // as a Conversation row, mirroring the Zoom/Meet/Teams transcript flow.
  // The conversation is created with source='discord' so the existing
  // /api/conversations/:id/summarize endpoint can produce summary +
  // routable action items.
  app.post(
    "/api/discord/import-channel",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const { channelId, channelName, guildName, maxMessages } =
          (req.body || {}) as {
            channelId?: string;
            channelName?: string;
            guildName?: string;
            maxMessages?: number;
          };
        if (!channelId || typeof channelId !== "string") {
          return res.status(400).json({ error: "channelId is required" });
        }

        // Ownership: the channel's guild must be in the user's mapping.
        const guildId = await getChannelGuildId(channelId);
        if (!guildId) return res.status(404).json({ error: "Channel not found" });
        if (!(await userOwnsGuild(userId, guildId))) {
          return res
            .status(403)
            .json({ error: "You haven't authorized the bot in that server" });
        }

        const cap = Math.min(
          Math.max(parseInt(String(maxMessages ?? 500), 10) || 500, 1),
          1000,
        );

        // Discord caps at 100/page; paginate with `before` until we hit cap.
        const collected: any[] = [];
        let before: string | undefined;
        const botAuth = `Bot ${getBotToken()}`;
        while (collected.length < cap) {
          const remaining = Math.min(100, cap - collected.length);
          const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${remaining}${
            before ? `&before=${before}` : ""
          }`;
          const r = await fetch(url, { headers: { Authorization: botAuth } });
          if (!r.ok) {
            return res
              .status(502)
              .json({ error: `Discord API error (${r.status})` });
          }
          const batch = await r.json();
          if (!Array.isArray(batch) || batch.length === 0) break;
          collected.push(...batch);
          before = batch[batch.length - 1].id;
          if (batch.length < remaining) break;
        }

        if (collected.length === 0) {
          return res
            .status(400)
            .json({ error: "Channel has no readable messages" });
        }

        // Discord returns newest-first; flip to chronological then remap
        // to the DiscordChatExporter shape so normalizeConversation works.
        const messages = collected.reverse().map((m: any) => ({
          id: m.id,
          timestamp: m.timestamp,
          content: m.content,
          author: {
            name: m.author?.global_name || m.author?.username,
            username: m.author?.username,
          },
        }));

        const normalized = normalizeConversation(
          JSON.stringify({
            channel: { name: channelName || channelId },
            guild: { name: guildName },
            messages,
          }),
          "discord",
          channelName ? `Discord: #${channelName}` : `Discord channel ${channelId}`,
        );

        const conv = await storage.createConversation({
          userId,
          title: normalized.title,
          source: normalized.source,
          content: normalized.content,
          participants: normalized.participants,
          meetingDate: normalized.meetingDate,
          tags: ["discord", channelName || channelId],
          channelName: channelName || channelId,
          threadId: null,
        });
        res.json({ conversation: conv, messageCount: messages.length });
      } catch (err: any) {
        handleDiscordError(res, err);
      }
    },
  );

  app.get(
    "/api/discord/messages/:channelId",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const { channelId } = req.params;
        if (!channelId) {
          return res.status(400).json({ error: "channelId is required" });
        }
        const limit = Math.min(
          Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1),
          100,
        );
        const before =
          typeof req.query.before === "string" ? req.query.before : undefined;

        const guildId = await getChannelGuildId(channelId);
        if (!guildId) {
          return res.status(404).json({ error: "Channel not found" });
        }
        if (!(await userOwnsGuild(userId, guildId))) {
          return res
            .status(403)
            .json({ error: "You haven't authorized the bot in that server" });
        }
        const messages = await listMessagesPage(channelId, limit, before);
        res.json({
          count: messages.length,
          nextBefore:
            messages.length === limit ? messages[messages.length - 1].id : null,
          messages,
        });
      } catch (err: any) {
        handleDiscordError(res, err);
      }
    },
  );
}
