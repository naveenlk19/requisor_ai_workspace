import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Loader2,
  MessagesSquare,
  Hash,
  ShieldCheck,
  Plus,
  RefreshCw,
  Unplug,
  Sparkles,
  ChevronRight,
  Inbox,
  ArrowUp,
} from "lucide-react";

interface Guild {
  id: string;
  name: string | null;
  icon: string | null;
  botPresent: boolean;
}
interface Channel {
  id: string;
  name: string;
  topic: string | null;
}
interface Message {
  id: string;
  content: string;
  timestamp: string;
  author: { id: string; username: string; globalName?: string };
}
interface MessagesPage {
  count: number;
  nextBefore: string | null;
  messages: Message[];
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    return sameDay
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  } catch {
    return ts;
  }
}

const AVATAR_PALETTE = [
  "bg-indigo-100 text-indigo-700",
  "bg-rose-100 text-rose-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function GuildIcon({ guild, size = 24 }: { guild: Guild; size?: number }) {
  const dim = { width: size, height: size };
  if (guild.icon) {
    return (
      <img
        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
        alt={guild.name || "server"}
        className="rounded-md object-cover"
        style={dim}
      />
    );
  }
  return (
    <div
      className="rounded-md bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold"
      style={dim}
    >
      {initials(guild.name || "S")}
    </div>
  );
}

export default function DiscordBrowser() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [selectedGuild, setSelectedGuild] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const guildsQuery = useQuery<Guild[]>({
    queryKey: ["/api/discord/guilds"],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("discord") === "connected") {
      toast({ title: "Discord connected", description: "Server authorized." });
      queryClient.invalidateQueries({ queryKey: ["/api/discord/guilds"] });
      params.delete("discord");
      const next = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", next);
    }
  }, [location, queryClient, toast, setLocation]);

  const connectMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/discord/connect-url", { method: "GET" }),
    onSuccess: (data: any) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (e: any) =>
      toast({
        title: "Could not start Discord connection",
        description: e?.message || "Server is missing DISCORD_CLIENT_ID.",
        variant: "destructive",
      }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (guildId?: string) =>
      apiRequest("/api/discord/disconnect", {
        method: "POST",
        body: JSON.stringify(guildId ? { guildId } : {}),
      }),
    onSuccess: () => {
      setSelectedGuild("");
      setSelectedChannel("");
      setMessages([]);
      queryClient.invalidateQueries({ queryKey: ["/api/discord/guilds"] });
      toast({ title: "Disconnected" });
    },
  });

  const channelsQuery = useQuery<Channel[]>({
    queryKey: ["/api/discord/channels", selectedGuild],
    queryFn: async () => {
      const r = await fetch(`/api/discord/channels/${selectedGuild}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      return r.json();
    },
    enabled: !!selectedGuild,
  });

  async function loadMessages(channelId: string, before?: string) {
    if (!channelId) return;
    setLoadingMore(true);
    try {
      const r = await fetch(
        `/api/discord/messages/${channelId}?limit=50${before ? `&before=${before}` : ""}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      const data: MessagesPage = await r.json();
      const chronological = [...data.messages].reverse();
      setMessages((prev) => (before ? [...chronological, ...prev] : chronological));
      setNextBefore(data.nextBefore);
    } catch (e: any) {
      toast({
        title: "Failed to load messages",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (selectedChannel) {
      setMessages([]);
      setNextBefore(null);
      loadMessages(selectedChannel);
    }
  }, [selectedChannel]);

  const guilds = guildsQuery.data || [];
  const hasConnections = guilds.length > 0;
  const currentGuild = guilds.find((g) => g.id === selectedGuild);
  const currentChannel = channelsQuery.data?.find((c) => c.id === selectedChannel);
  const currentChannelName = currentChannel?.name;
  const currentGuildName = currentGuild?.name;

  // Group consecutive messages from the same author within 5 min
  const grouped = useMemo(() => {
    const groups: { authorId: string; items: Message[] }[] = [];
    for (const m of messages) {
      const last = groups[groups.length - 1];
      const prev = last?.items[last.items.length - 1];
      const within5min =
        prev &&
        Math.abs(
          new Date(m.timestamp).getTime() - new Date(prev.timestamp).getTime(),
        ) <
          5 * 60 * 1000;
      if (last && last.authorId === m.author.id && within5min) {
        last.items.push(m);
      } else {
        groups.push({ authorId: m.author.id, items: [m] });
      }
    }
    return groups;
  }, [messages]);

  const importMutation = useMutation({
    mutationFn: async (opts: { summarize: boolean }) => {
      const importRes = await fetch("/api/discord/import-channel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: selectedChannel,
          channelName: currentChannelName,
          guildName: currentGuildName,
          maxMessages: 500,
        }),
      });
      if (!importRes.ok) {
        throw new Error(
          (await importRes.json().catch(() => ({})))?.error || "Import failed",
        );
      }
      const { conversation, messageCount } = await importRes.json();
      if (opts.summarize && conversation?.id) {
        const sum = await fetch(
          `/api/conversations/${conversation.id}/summarize`,
          { method: "PATCH", credentials: "include" },
        );
        if (!sum.ok) {
          throw new Error(
            (await sum.json().catch(() => ({})))?.error || "Summarize failed",
          );
        }
      }
      return { conversation, messageCount, summarized: opts.summarize };
    },
    onSuccess: ({ conversation, messageCount, summarized }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({
        title: summarized ? "Imported & summarized" : "Imported as conversation",
        description: `${messageCount} messages from #${currentChannelName}. Open it from Meetings → Conversations to view summary and route action items.`,
      });
    },
    onError: (e: any) =>
      toast({
        title: "Import failed",
        description: e?.message || "Try again.",
        variant: "destructive",
      }),
  });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {!hasConnections && (
          <Card data-testid="card-discord-connect" className="border-indigo-100">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">Connect Discord</CardTitle>
                  <CardDescription className="mt-1">
                    Authorize the Requisor bot into one of your Discord servers.
                    We never see or store your account credentials — Discord only
                    shares the server you pick.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                data-testid="button-discord-connect"
              >
                {connectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Connect Discord
              </Button>
            </CardContent>
          </Card>
        )}

        {hasConnections && (
          <Card data-testid="card-discord-pickers" className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                    <MessagesSquare className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Browse Discord
                      <Badge variant="secondary" className="text-xs font-normal">
                        {guilds.length} server{guilds.length === 1 ? "" : "s"}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      Pick a server, then a text channel, to read recent messages.
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Refresh servers"
                        onClick={() =>
                          queryClient.invalidateQueries({
                            queryKey: ["/api/discord/guilds"],
                          })
                        }
                        data-testid="button-discord-refresh"
                      >
                        <RefreshCw
                          className={cn(
                            "h-3.5 w-3.5",
                            guildsQuery.isFetching && "animate-spin",
                          )}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Refresh servers</TooltipContent>
                  </Tooltip>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => connectMutation.mutate()}
                    data-testid="button-discord-add-server"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add server
                  </Button>
                </div>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Server
                </label>
                <Select
                  value={selectedGuild}
                  onValueChange={(v) => {
                    setSelectedGuild(v);
                    setSelectedChannel("");
                    setMessages([]);
                  }}
                >
                  <SelectTrigger data-testid="select-discord-guild">
                    <SelectValue placeholder="Select a server">
                      {currentGuild && (
                        <span className="flex items-center gap-2">
                          <GuildIcon guild={currentGuild} size={20} />
                          <span className="truncate">
                            {currentGuild.name ||
                              `Unknown (${currentGuild.id.slice(0, 6)}…)`}
                          </span>
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {guilds.map((g) => (
                      <SelectItem key={g.id} value={g.id} disabled={!g.botPresent}>
                        <span className="flex items-center gap-2">
                          <GuildIcon guild={g} size={20} />
                          <span className="truncate">
                            {g.name || `Unknown (${g.id.slice(0, 6)}…)`}
                          </span>
                          {!g.botPresent && (
                            <Badge variant="outline" className="ml-1 text-[10px]">
                              bot removed
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Channel
                </label>
                <Select
                  value={selectedChannel}
                  onValueChange={(v) => setSelectedChannel(v)}
                  disabled={!selectedGuild || channelsQuery.isLoading}
                >
                  <SelectTrigger data-testid="select-discord-channel">
                    <SelectValue
                      placeholder={
                        !selectedGuild
                          ? "Select a server first"
                          : channelsQuery.isLoading
                            ? "Loading channels…"
                            : "Select a channel"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(channelsQuery.data || []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-1.5">
                          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedGuild && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${currentGuildName || "server"}`}
                      className="text-muted-foreground hover:text-red-600 hover:bg-red-50 self-end"
                      onClick={() => disconnectMutation.mutate(selectedGuild)}
                      disabled={disconnectMutation.isPending}
                      data-testid="button-discord-disconnect"
                    >
                      <Unplug className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Remove {currentGuildName || "server"}
                  </TooltipContent>
                </Tooltip>
              )}
            </CardContent>
          </Card>
        )}

        {selectedChannel && (
          <Card data-testid="card-discord-messages" className="overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-b from-slate-50 to-transparent">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    {currentGuild && <GuildIcon guild={currentGuild} size={16} />}
                    <span className="truncate">{currentGuildName}</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span>channel</span>
                  </div>
                  <CardTitle className="text-lg flex items-center gap-1.5">
                    <Hash className="h-4 w-4 text-indigo-600" />
                    {currentChannelName || "messages"}
                  </CardTitle>
                  {currentChannel?.topic && (
                    <CardDescription className="mt-1 line-clamp-2">
                      {currentChannel.topic}
                    </CardDescription>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {messages.length} message{messages.length === 1 ? "" : "s"} loaded
                    </Badge>
                    {loadingMore && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> loading…
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    disabled={importMutation.isPending || messages.length === 0}
                    onClick={() => importMutation.mutate({ summarize: true })}
                    data-testid="button-discord-import-summarize"
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Import & Summarize
                  </Button>
                </div>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <ScrollArea className="h-[480px]">
                <div className="px-5 py-4">
                  {messages.length === 0 && !loadingMore ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                        <Inbox className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="text-sm font-medium text-slate-700">
                        No messages in this channel
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Try another channel or post a message in Discord.
                      </p>
                    </div>
                  ) : (
                    <>
                      {nextBefore && (
                        <div className="flex justify-center mb-4">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={loadingMore}
                            onClick={() =>
                              loadMessages(selectedChannel, nextBefore)
                            }
                          >
                            {loadingMore ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            ) : (
                              <ArrowUp className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Load older
                          </Button>
                        </div>
                      )}
                      <ul className="space-y-4">
                        {grouped.map((group, gi) => {
                          const head = group.items[0];
                          const name =
                            head.author.globalName || head.author.username;
                          return (
                            <li
                              key={`${group.authorId}-${gi}`}
                              className="flex gap-3 group"
                              data-testid={`row-discord-group-${head.id}`}
                            >
                              <div
                                className={cn(
                                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                  colorForId(group.authorId),
                                )}
                              >
                                {initials(name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-sm font-semibold text-slate-900">
                                    {name}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {formatTime(head.timestamp)}
                                  </span>
                                </div>
                                <div className="space-y-0.5 mt-0.5">
                                  {group.items.map((m) => (
                                    <div
                                      key={m.id}
                                      className="text-sm whitespace-pre-wrap break-words text-slate-700 leading-relaxed"
                                      data-testid={`row-discord-message-${m.id}`}
                                    >
                                      {m.content || (
                                        <span className="italic text-muted-foreground">
                                          [no text content]
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
