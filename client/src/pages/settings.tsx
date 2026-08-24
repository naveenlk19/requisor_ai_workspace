import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  User as UserIcon,
  KeyRound,
  Link2,
  CreditCard,
  LogOut,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Mail,
} from "lucide-react";
import { SiZoom, SiGoogle, SiDiscord } from "react-icons/si";
import { FaSlack } from "react-icons/fa";

type MeetingsStatus = Record<
  string,
  { connected: boolean; workspaceName?: string; lastSynced?: string }
>;

type ChatStatus = {
  slack: { connected: boolean; workspaceName?: string };
  discord: { connected: boolean; botName?: string };
};

type Subscription = {
  planId?: number | null;
  plan?: { id: number; name: string; price?: number } | null;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
};

function ProfileCard() {
  const { user } = useAuth();
  const initials = [user?.firstName, user?.lastName]
    .map((s) => (s ? s[0]?.toUpperCase() : ""))
    .join("");

  return (
    <Card data-testid="card-profile">
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-slate-500" />
          <CardTitle>Profile</CardTitle>
        </div>
        <CardDescription>Your account information.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xl font-semibold">
            {user?.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt="avatar"
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              initials || <UserIcon className="h-7 w-7" />
            )}
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Name</Label>
              <p className="text-sm text-slate-800 font-medium">
                {[user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
                  "—"}
              </p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Email</Label>
              <p className="text-sm text-slate-800 font-medium flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                {user?.email || "—"}
              </p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Username</Label>
              <p className="text-sm text-slate-800">
                {user?.username || "—"}
              </p>
            </div>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Need to update your name or avatar?
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/profile">Edit profile</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = useMutation({
    mutationFn: async (data: {
      currentPassword: string;
      newPassword: string;
    }) => {
      return await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Password updated",
        description: "Your password has been changed.",
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Could not update password",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Use at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Re-enter your new password.",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <Card data-testid="card-password">
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-slate-500" />
          <CardTitle>Password</CardTitle>
        </div>
        <CardDescription>
          Change the password used to sign in to your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3 max-w-md">
          <div>
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              data-testid="input-current-password"
            />
          </div>
          <div>
            <Label htmlFor="new">New password</Label>
            <Input
              id="new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              data-testid="input-new-password"
            />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              data-testid="input-confirm-password"
            />
          </div>
          <Button
            type="submit"
            disabled={mutation.isPending}
            data-testid="button-update-password"
          >
            {mutation.isPending && (
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
            )}
            Update password
          </Button>
          <p className="text-xs text-slate-500">
            Signed in with Google or another provider?{" "}
            <Link
              href="/auth"
              className="text-emerald-700 hover:underline"
            >
              Set a password via password reset
            </Link>
            .
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

type IntegrationDef = {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: "meetings" | "chat";
  provider?: string;
};

const INTEGRATIONS: IntegrationDef[] = [
  {
    key: "zoom",
    label: "Zoom",
    description: "Import meetings and cloud recording transcripts.",
    icon: <SiZoom className="h-5 w-5 text-[#2D8CFF]" />,
    category: "meetings",
    provider: "zoom",
  },
  {
    key: "google_meet",
    label: "Google Meet",
    description: "Sync meetings and transcripts from Google Calendar.",
    icon: <SiGoogle className="h-5 w-5 text-[#4285F4]" />,
    category: "meetings",
    provider: "google_meet",
  },
  {
    key: "slack",
    label: "Slack",
    description: "Import team conversations and channel messages.",
    icon: <FaSlack className="h-5 w-5 text-[#4A154B]" />,
    category: "meetings",
    provider: "slack",
  },
  {
    key: "discord",
    label: "Discord",
    description: "Browse and import messages from Discord channels.",
    icon: <SiDiscord className="h-5 w-5 text-[#5865F2]" />,
    category: "chat",
  },
];

function IntegrationsCard() {
  const { toast } = useToast();

  const meetings = useQuery<MeetingsStatus>({
    queryKey: ["/api/integrations/meetings/status"],
  });

  const chat = useQuery<ChatStatus>({
    queryKey: ["/api/conversations/integrations/status"],
  });

  const isConnected = (def: IntegrationDef) => {
    if (def.category === "meetings") {
      return !!meetings.data?.[def.provider!]?.connected;
    }
    if (def.key === "discord") return !!chat.data?.discord.connected;
    return false;
  };

  const connectMeetings = useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(
        `/api/integrations/meetings/${provider}/auth-url`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to start connection");
      const data = await res.json();
      if (!data.authUrl) throw new Error("Missing auth URL");
      window.location.href = data.authUrl;
    },
    onError: (e: Error) =>
      toast({
        title: "Could not connect",
        description: e.message,
        variant: "destructive",
      }),
  });

  const disconnectMeetings = useMutation({
    mutationFn: async (provider: string) => {
      return await apiRequest(
        `/api/integrations/meetings/${provider}/disconnect`,
        { method: "POST" },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/integrations/meetings/status"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/zoom/status"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/google-meet/status"],
      });
      toast({ title: "Disconnected" });
    },
    onError: (e: Error) =>
      toast({
        title: "Could not disconnect",
        description: e.message,
        variant: "destructive",
      }),
  });

  const disconnectDiscord = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/conversations/discord/disconnect", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/conversations/integrations/status"],
      });
      toast({ title: "Discord disconnected" });
    },
    onError: (e: Error) =>
      toast({
        title: "Could not disconnect",
        description: e.message,
        variant: "destructive",
      }),
  });

  const handleConnect = (def: IntegrationDef) => {
    if (def.category === "meetings" && def.provider) {
      connectMeetings.mutate(def.provider);
    } else if (def.key === "discord") {
      window.location.href = "/conversations?connect=discord";
    }
  };

  const handleDisconnect = (def: IntegrationDef) => {
    if (def.category === "meetings" && def.provider) {
      disconnectMeetings.mutate(def.provider);
    } else if (def.key === "discord") {
      disconnectDiscord.mutate();
    }
  };

  const isLoading = meetings.isLoading || chat.isLoading;

  return (
    <Card data-testid="card-integrations">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-slate-500" />
          <CardTitle>Integrations</CardTitle>
        </div>
        <CardDescription>
          Connect the tools where your meetings and conversations happen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))
          : INTEGRATIONS.map((def) => {
              const connected = isConnected(def);
              const pending =
                (connectMeetings.isPending &&
                  connectMeetings.variables === def.provider) ||
                (disconnectMeetings.isPending &&
                  disconnectMeetings.variables === def.provider) ||
                (def.key === "discord" && disconnectDiscord.isPending);
              return (
                <div
                  key={def.key}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50/60"
                  data-testid={`integration-${def.key}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                      {def.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800">
                          {def.label}
                        </p>
                        {connected ? (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-50 text-emerald-700 gap-1 h-5 text-[10px]"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Connected
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-slate-100 text-slate-500 gap-1 h-5 text-[10px]"
                          >
                            <XCircle className="h-3 w-3" />
                            Not connected
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {def.description}
                      </p>
                    </div>
                  </div>
                  {connected ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          data-testid={`button-disconnect-${def.key}`}
                        >
                          {pending && (
                            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                          )}
                          Disconnect
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Disconnect {def.label}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Requisor will lose access to your {def.label} data.
                            You can reconnect any time. Imported transcripts
                            and conversations remain in your Brain.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDisconnect(def)}
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleConnect(def)}
                      disabled={pending}
                      data-testid={`button-connect-${def.key}`}
                    >
                      {pending && (
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                      )}
                      Connect
                    </Button>
                  )}
                </div>
              );
            })}
        <p className="text-xs text-slate-500 pt-1">
          See the{" "}
          <Link
            href="/zoom-integration"
            className="text-emerald-700 hover:underline"
          >
            Zoom integration guide
          </Link>{" "}
          for details on scopes and data handling.
        </p>
      </CardContent>
    </Card>
  );
}

function SubscriptionCard() {
  const sub = useQuery<Subscription>({
    queryKey: ["/api/user/subscription"],
  });

  const planName =
    sub.data?.plan?.name || sub.data?.subscriptionPlan || "Free";
  const status = sub.data?.subscriptionStatus || "active";

  return (
    <Card data-testid="card-subscription">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-slate-500" />
          <CardTitle>Plan & usage</CardTitle>
        </div>
        <CardDescription>
          Manage your subscription and AI token budget.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sub.isLoading ? (
          <Skeleton className="h-10 w-48" />
        ) : (
          <div className="flex items-center gap-2 mb-4">
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white capitalize">
              {planName}
            </Badge>
            <span className="text-xs text-slate-500 capitalize">{status}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/pricing">
              View plans
              <ExternalLink className="h-3 w-3 ml-1.5" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/token-usage">Token usage</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DangerCard() {
  const { logoutMutation } = useAuth();
  return (
    <Card className="border-red-100" data-testid="card-account-actions">
      <CardHeader>
        <div className="flex items-center gap-2">
          <LogOut className="h-5 w-5 text-slate-500" />
          <CardTitle>Account</CardTitle>
        </div>
        <CardDescription>Sign out of this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          data-testid="button-logout"
        >
          {logoutMutation.isPending && (
            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
          )}
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your profile, password, integrations, and plan.
        </p>
      </div>

      <div className="space-y-5">
        <ProfileCard />
        <PasswordCard />
        <IntegrationsCard />
        <SubscriptionCard />
        <DangerCard />
      </div>
    </div>
  );
}
