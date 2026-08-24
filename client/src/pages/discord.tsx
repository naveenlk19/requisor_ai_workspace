import DiscordBrowser from "@/components/discord-browser";

export default function DiscordPage() {
  return (
    <div className="container max-w-5xl py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Discord</h1>
        <p className="text-sm text-muted-foreground">
          Connect a bot, browse your servers and channels, and read recent
          messages — all without leaving Requisor.
        </p>
      </div>
      <DiscordBrowser />
    </div>
  );
}
