import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Plug,
  Plus,
  Copy,
  Check,
  Trash2,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Terminal,
  CheckCircle2,
  Radio,
  Sparkles,
} from "lucide-react";

interface AccessToken {
  id: number;
  name: string;
  tokenPrefix: string | null;
  revoked: boolean;
  lastUsedAt: string | null;
  createdAt: string | null;
}

interface CreatedToken extends AccessToken {
  token: string;
}

const MCP_TOOLS = [
  { name: "list_projects", desc: "List your projects with status & progress." },
  { name: "get_project_tasks", desc: "Read the tasks inside a project." },
  {
    name: "search_evidence",
    desc: "Search your notes, files, meetings & insights.",
  },
  {
    name: "list_discoveries",
    desc: "List feature candidates with RICE scores.",
  },
  {
    name: "query_beliefs",
    desc: "Look up consolidated, attributed claims.",
  },
  {
    name: "search_my_context",
    desc: "Hybrid retrieval across everything you've captured.",
  },
];

const EXAMPLE_PROMPTS = [
  "List my Requisor projects",
  "What are my top feature candidates by RICE score?",
  "Search my Requisor context: what have customers said about onboarding?",
  "What tasks are still open in my most active project?",
];

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      data-testid="button-copy"
    >
      {copied ? (
        <Check className="h-4 w-4" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {label ? <span className="ml-2">{copied ? "Copied" : label}</span> : null}
    </Button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="bg-slate-950 text-slate-100 text-xs rounded-lg p-4 overflow-x-auto">
        <code>{code}</code>
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton value={code} />
      </div>
    </div>
  );
}

function isDevPreviewHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".replit.dev") ||
    hostname.endsWith(".repl.co")
  );
}

export default function ConnectPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);
  // Plaintext token kept for the setup snippets — survives closing the
  // reveal-once dialog so the auto-filled configs keep working.
  const [setupToken, setSetupToken] = useState<string | null>(null);
  // Id of the token created in this session — used to detect the first
  // successful connection (its lastUsedAt flips from null to a timestamp).
  const [watchTokenId, setWatchTokenId] = useState<number | null>(null);

  const mcpUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "https://your-app.example.com/api/mcp";

  const onDevPreview =
    typeof window !== "undefined" && isDevPreviewHost(window.location.hostname);

  const { data: tokens = [], isLoading } = useQuery<AccessToken[]>({
    queryKey: ["/api/mcp/tokens"],
    refetchInterval: (query) => {
      // While we're waiting for the first connection on a fresh token,
      // poll every 5 seconds so the success state appears automatically.
      if (watchTokenId == null) return false;
      const list = query.state.data;
      const watched = list?.find((t) => t.id === watchTokenId);
      if (watched?.lastUsedAt) return false; // connected — stop polling
      return 5000;
    },
  });

  const watchedToken = useMemo(
    () =>
      watchTokenId != null
        ? tokens.find((t) => t.id === watchTokenId)
        : undefined,
    [tokens, watchTokenId],
  );
  const isConnected = !!watchedToken?.lastUsedAt;

  // Small celebratory toast the moment the first connection lands.
  useEffect(() => {
    if (isConnected) {
      toast({
        title: "Connected!",
        description:
          "Your AI tool just talked to Requisor for the first time.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const createMutation = useMutation({
    mutationFn: async (name: string) =>
      apiRequest("/api/mcp/tokens", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (data: CreatedToken) => {
      setCreatedToken(data);
      setSetupToken(data.token);
      setWatchTokenId(data.id);
      setCreateOpen(false);
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/tokens"] });
    },
    onError: () => {
      toast({
        title: "Could not create token",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) =>
      apiRequest(`/api/mcp/tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Token revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/tokens"] });
    },
    onError: () => {
      toast({
        title: "Could not revoke token",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const tokenForConfig = setupToken ?? "<YOUR_TOKEN>";

  const claudeCodeCommand = `claude mcp add --transport http requisor ${mcpUrl} --header "Authorization: Bearer ${tokenForConfig}"`;

  const claudeConfig = `{
  "mcpServers": {
    "requisor": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${mcpUrl}",
        "--header",
        "Authorization: Bearer ${tokenForConfig}"
      ]
    }
  }
}`;

  const cursorConfig = `{
  "mcpServers": {
    "requisor": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer ${tokenForConfig}"
      }
    }
  }
}`;

  const genericConfig = `POST ${mcpUrl}
Content-Type: application/json
Authorization: Bearer ${tokenForConfig}

# Transport: MCP Streamable HTTP (JSON-RPC 2.0)
# Example initialize request body:
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": { "name": "my-client", "version": "1.0.0" }
  }
}`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-100 text-emerald-700 p-2.5">
            <Plug className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Connect Requisor to AI tools
            </h1>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Requisor speaks the Model Context Protocol (MCP). Connect Claude,
              Cursor, or any MCP client and let it read your projects, tasks,
              evidence, discoveries and context — securely and read-only.
            </p>
          </div>
        </div>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Read-only & scoped to you</AlertTitle>
        <AlertDescription>
          Connected tools can only read your own data. They cannot create,
          edit, or delete anything. Access is authenticated with a personal
          token you can revoke at any time.
        </AlertDescription>
      </Alert>

      {onDevPreview && (
        <Alert variant="destructive" data-testid="alert-dev-preview">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>You're on a temporary preview address</AlertTitle>
          <AlertDescription>
            The web address of this page (
            <code>
              {typeof window !== "undefined" ? window.location.hostname : ""}
            </code>
            ) is a development preview that can go to sleep or change. Tools
            like Claude need your app's <strong>published</strong> address to
            reach it reliably. Publish the app first, then open this page from
            the published address so the setup snippets below use the right
            URL.
          </AlertDescription>
        </Alert>
      )}

      {/* Easiest path — one-click OAuth connect */}
      <Card
        className="border-emerald-200 bg-emerald-50/50"
        data-testid="card-oauth-connect"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" /> Easiest: one-click
            connect for Claude
            <Badge className="bg-emerald-600 hover:bg-emerald-600">
              No token needed
            </Badge>
          </CardTitle>
          <CardDescription>
            Claude (on claude.ai and in Claude Desktop) can connect with just
            this URL — you approve access in your browser, no copy-pasting
            tokens or editing config files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-slate-600 font-medium">Server URL:</span>
            <code className="bg-white border rounded px-2 py-0.5">
              {mcpUrl}
            </code>
            <CopyButton value={mcpUrl} label="Copy URL" />
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-600">
            <li>
              In Claude, open <em>Settings → Connectors</em> and click{" "}
              <strong>Add custom connector</strong>.
            </li>
            <li>
              Name it "Requisor" and paste the server URL above, then click{" "}
              <strong>Add</strong>.
            </li>
            <li>
              Click <strong>Connect</strong> — a browser window opens where you
              sign in to Requisor and approve read-only access. That's it.
            </li>
          </ol>
          <p className="text-xs text-slate-500">
            Connections made this way show up in the token list below (named
            after the app), and you can revoke them anytime. The manual setups
            further down are only needed for tools without OAuth support.
          </p>
        </CardContent>
      </Card>

      {/* Step 1 — create a token */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> 1. Create an access token
          </CardTitle>
          <CardDescription>
            Each MCP client needs a personal access token. The token is shown
            once — copy it somewhere safe. Create it here first and it will be
            filled into every setup snippet below automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => setCreateOpen(true)}
            data-testid="button-new-token"
          >
            <Plus className="h-4 w-4 mr-2" /> New token
          </Button>

          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tokens…
            </div>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-slate-500">
              You don't have any tokens yet.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {tokens.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-4 p-3"
                  data-testid={`row-token-${t.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{t.name}</span>
                      {t.revoked ? (
                        <Badge variant="destructive">Revoked</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      <code>{t.tokenPrefix ?? "rqsr_"}…</code>
                      {t.lastUsedAt
                        ? ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                        : " · never used"}
                    </div>
                  </div>
                  {!t.revoked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeMutation.mutate(t.id)}
                      disabled={revokeMutation.isPending}
                      data-testid={`button-revoke-${t.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — configure clients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" /> 2. Add Requisor to your AI tool
          </CardTitle>
          <CardDescription>
            Pick your tool below and follow the steps. If you see{" "}
            <code>&lt;YOUR_TOKEN&gt;</code>, go back to step 1 and create a
            token first — it will be filled in automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-slate-500">Server URL:</span>
            <code className="bg-slate-100 rounded px-2 py-0.5">{mcpUrl}</code>
            <CopyButton value={mcpUrl} />
          </div>

          <Tabs defaultValue="claude-code">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="claude-code" data-testid="tab-claude-code">
                Claude Code
              </TabsTrigger>
              <TabsTrigger value="claude" data-testid="tab-claude-desktop">
                Claude Desktop
              </TabsTrigger>
              <TabsTrigger value="cursor">Cursor</TabsTrigger>
              <TabsTrigger value="generic">Generic / HTTP</TabsTrigger>
            </TabsList>

            <TabsContent value="claude-code" className="space-y-3">
              <p className="text-sm text-slate-500">
                Claude Code is Anthropic's AI assistant for the terminal — this
                is the easiest way to connect. Open a terminal and paste this
                one command:
              </p>
              <CodeBlock code={claudeCodeCommand} />
              <p className="text-sm text-slate-500">
                That's it. Next time you run <code>claude</code>, ask it
                something about your Requisor projects to confirm it works.
              </p>
            </TabsContent>

            <TabsContent value="claude" className="space-y-3">
              <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
                <li>
                  <strong>Install Node.js</strong> if you don't have it — the
                  free download from{" "}
                  <a
                    href="https://nodejs.org"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 underline"
                  >
                    nodejs.org
                  </a>{" "}
                  (Claude Desktop needs it to reach servers on the web).
                </li>
                <li>
                  <strong>Open the config file.</strong> In Claude Desktop, go
                  to <em>Settings → Developer → Edit Config</em>. This opens{" "}
                  <code>claude_desktop_config.json</code>:
                  <ul className="list-disc list-inside ml-5 mt-1 space-y-0.5 text-xs text-slate-500">
                    <li>
                      Mac:{" "}
                      <code>
                        ~/Library/Application Support/Claude/claude_desktop_config.json
                      </code>
                    </li>
                    <li>
                      Windows:{" "}
                      <code>%APPDATA%\Claude\claude_desktop_config.json</code>
                    </li>
                  </ul>
                </li>
                <li>
                  <strong>Paste the snippet below</strong> into the file and
                  save. (If the file already has an <code>"mcpServers"</code>{" "}
                  section, add just the <code>"requisor"</code> part inside it
                  instead of pasting the whole thing.)
                </li>
                <li>
                  <strong>Fully restart Claude Desktop</strong> — quit it
                  completely (not just close the window), then open it again.
                </li>
                <li>
                  <strong>Look for the tools icon</strong> (a small hammer or
                  plug) in the chat box. You should see "requisor" listed.
                </li>
              </ol>
              <CodeBlock code={claudeConfig} />
            </TabsContent>

            <TabsContent value="cursor" className="space-y-2">
              <p className="text-sm text-slate-500">
                Add this to <code>~/.cursor/mcp.json</code> (or
                Settings → MCP → Add server), then restart Cursor.
              </p>
              <CodeBlock code={cursorConfig} />
            </TabsContent>

            <TabsContent value="generic" className="space-y-2">
              <p className="text-sm text-slate-500">
                Any MCP client that supports the Streamable HTTP transport can
                connect by POSTing JSON-RPC to the URL with a Bearer token.
              </p>
              <CodeBlock code={genericConfig} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Step 3 — did it work? */}
      <Card data-testid="card-connection-check">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isConnected ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <Radio className="h-5 w-5" />
            )}{" "}
            3. Did it work?
          </CardTitle>
          <CardDescription>
            {watchTokenId != null
              ? "We're watching your new token. The moment your AI tool connects, this turns green."
              : "Create a token above and this page will automatically detect the first connection."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <Alert
              className="border-emerald-200 bg-emerald-50"
              data-testid="status-connected"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-emerald-800">
                Connected — your AI tool just reached Requisor
              </AlertTitle>
              <AlertDescription className="text-emerald-700">
                Everything is set up. Try one of the example prompts below.
              </AlertDescription>
            </Alert>
          ) : watchTokenId != null ? (
            <div className="space-y-3" data-testid="status-waiting">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for the first connection… finish the setup in step 2,
                then ask your AI tool a question about Requisor.
              </div>
              <div className="text-sm text-slate-500 rounded-lg border p-3 space-y-1">
                <p className="font-medium text-slate-600">
                  Not connecting? Check these:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>
                    The token was pasted exactly, with no extra spaces (it
                    starts with <code>rqsr_</code>).
                  </li>
                  <li>
                    The server URL matches this page: <code>{mcpUrl}</code>
                  </li>
                  {onDevPreview && (
                    <li>
                      You're on a preview address — external tools usually
                      need the published app address (see the warning at the
                      top).
                    </li>
                  )}
                  <li>
                    Claude Desktop was fully quit and reopened after saving
                    the config.
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No connection detected yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 4 — try it out */}
      <Card data-testid="card-example-prompts">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> 4. Try asking your AI
          </CardTitle>
          <CardDescription>
            Once connected, paste any of these into Claude (or your tool of
            choice) to see it read your Requisor data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <div
              key={prompt}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <span className="text-sm text-slate-700">"{prompt}"</span>
              <CopyButton value={prompt} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* What it can do */}
      <Card>
        <CardHeader>
          <CardTitle>What your AI can now do</CardTitle>
          <CardDescription>
            These read-only tools become available to the connected client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {MCP_TOOLS.map((tool) => (
              <div
                key={tool.name}
                className="rounded-lg border p-3"
                data-testid={`tool-${tool.name}`}
              >
                <code className="text-sm font-semibold text-emerald-700">
                  {tool.name}
                </code>
                <p className="text-sm text-slate-500 mt-1">{tool.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create token dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create access token</DialogTitle>
            <DialogDescription>
              Give it a name so you remember where it's used (e.g. "Claude on my
              laptop").
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="token-name">Token name</Label>
            <Input
              id="token-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Claude Desktop"
              maxLength={100}
              data-testid="input-token-name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(newName.trim() || "MCP token")}
              disabled={createMutation.isPending}
              data-testid="button-create-token"
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal-once dialog */}
      <Dialog
        open={!!createdToken}
        onOpenChange={(open) => !open && setCreatedToken(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your token now</DialogTitle>
            <DialogDescription>
              This is the only time the full token is shown. If you lose it,
              revoke it and create a new one. It's also filled into the setup
              snippets on this page for you.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Treat this like a password</AlertTitle>
            <AlertDescription>
              Anyone with this token can read your Requisor data.
            </AlertDescription>
          </Alert>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-slate-100 rounded px-3 py-2 text-sm break-all">
              {createdToken?.token}
            </code>
            {createdToken && (
              <CopyButton value={createdToken.token} label="Copy" />
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
