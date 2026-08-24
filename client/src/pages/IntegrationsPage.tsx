import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Clock,
  ExternalLink,
  LogIn,
  RefreshCw,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Integration } from "@shared/schema";
import { IntegrationProvider } from "@shared/integrations";
import { Mail } from "lucide-react";
import { SiLinear } from "react-icons/si";

// Component for displaying provider information
const ProviderInfo = ({
  provider,
  isConnected,
}: {
  provider: IntegrationProvider;
  isConnected: boolean;
}) => {
  const getProviderInfo = (provider: IntegrationProvider) => {
    switch (provider) {
      case IntegrationProvider.SMARTSHEET:
        return {
          name: "Smartsheet",
          description: "Sync your sheets, tasks, and timelines with Smartsheet",
          color: "bg-blue-100 text-blue-800",
        };
      case IntegrationProvider.ASANA:
        return {
          name: "Asana",
          description: "Connect your Asana workspaces and projects",
          color: "bg-orange-100 text-orange-800",
        };
      case IntegrationProvider.MONDAY:
        return {
          name: "Monday.com",
          description: "Integrate with Monday.com boards and items",
          color: "bg-indigo-100 text-indigo-800",
        };
      case IntegrationProvider.JIRA:
        return {
          name: "Jira",
          description: "Sync with Atlassian Jira projects and issues",
          color: "bg-blue-100 text-blue-800",
        };
      case IntegrationProvider.LINEAR:
        return {
          name: "Linear",
          description: "Export projects and issues to Linear",
          color: "bg-violet-100 text-violet-800",
        };
      default:
        return {
          name: provider,
          description: "Connect with external platform",
          color: "bg-gray-100 text-gray-800",
        };
    }
  };

  const info = getProviderInfo(provider);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">{info.name}</h3>
        <Badge
          variant="outline"
          className={
            isConnected
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }
        >
          {isConnected ? "Connected" : "Not Connected"}
        </Badge>
      </div>
      <p className="text-sm text-gray-500">{info.description}</p>
    </div>
  );
};

// Component for a single integration card
const IntegrationCard = ({ integration }: { integration: Integration }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPulling, setIsPulling] = useState(false);

  // Mutation for deleting an integration
  const deleteIntegrationMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/integrations/${integration.id}`, {
        method: "DELETE",
      } as any);
    },
    onSuccess: () => {
      toast({
        title: "Integration deleted",
        description: "The integration has been removed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete integration. Please try again.",
        variant: "destructive",
      });
      console.error("Error deleting integration:", error);
    },
  });

  // Mutation for pulling projects
  const pullProjectsMutation = useMutation({
    mutationFn: async () => {
      setIsPulling(true);
      return apiRequest(`/api/integrations/${integration.id}/pull-projects`, {
        method: "POST",
      } as any);
    },
    onSuccess: (data) => {
      toast({
        title: "Projects imported",
        description: `Successfully imported ${data.projects?.length || 0} projects.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setIsPulling(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to import projects. Please try again.",
        variant: "destructive",
      });
      console.error("Error importing projects:", error);
      setIsPulling(false);
    },
  });

  const handlePullProjects = () => {
    pullProjectsMutation.mutate();
  };

  const handleDeleteIntegration = () => {
    deleteIntegrationMutation.mutate();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <ProviderInfo
          provider={integration.provider as IntegrationProvider}
          isConnected={integration.isConnected}
        />
      </CardHeader>
      <CardContent>
        <div className="text-sm space-y-2">
          {integration.lastSynced && (
            <div className="flex items-center gap-2 text-gray-500">
              <Clock size={16} />
              <span>
                Last synced: {new Date(integration.lastSynced).toLocaleString()}
              </span>
            </div>
          )}
          {integration.workspaceId && (
            <div className="flex items-center gap-2 text-gray-500">
              <span>Workspace ID: {integration.workspaceId}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between gap-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePullProjects}
            disabled={!integration.isConnected || isPulling}
          >
            {isPulling ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Import Projects
              </>
            )}
          </Button>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-red-500">
              <Trash2 className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will disconnect your integration with{" "}
                {integration.provider}. You can reconnect it later if needed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteIntegration}>
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
};

// Component for connecting a new integration
// Gmail card with live connect/disconnect state + connected-account email.
// Mirrors the controls in Brain → Conversations so users get the same surface
// from either entry point.
const GmailIntegrationCard = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: status, isLoading } = useQuery<{
    connected: boolean;
    email?: string | null;
  }>({
    queryKey: ["/api/integrations/gmail/status"],
  });

  const connect = useMutation({
    mutationFn: () => apiRequest("/api/integrations/gmail/auth"),
    onSuccess: (data: any) => {
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      }
    },
    onError: (e: any) =>
      toast({
        title: "Could not start Gmail connect",
        description: e?.message || "Please try again",
        variant: "destructive",
      }),
  });

  const disconnect = useMutation({
    mutationFn: () =>
      apiRequest("/api/integrations/gmail/disconnect", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Gmail disconnected" });
      queryClient.invalidateQueries({
        queryKey: ["/api/integrations/gmail/status"],
      });
    },
  });

  const connected = !!status?.connected;
  return (
    <Card data-testid="card-gmail-integration">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-red-50 flex items-center justify-center">
            <Mail className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Gmail</CardTitle>
              {isLoading ? null : connected ? (
                <Badge
                  variant="secondary"
                  className="bg-green-100 text-green-800"
                >
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )}
            </div>
            <CardDescription>
              Import emails (with attachments) into Conversations
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {connected && status?.email && (
          <p
            className="text-xs text-gray-600 mb-2"
            data-testid="text-gmail-email"
          >
            Signed in as <span className="font-medium">{status.email}</span>
          </p>
        )}
        <p className="text-sm text-gray-600 mb-3">
          {connected
            ? "Pick messages to import in Brain → Conversations, optionally assigning them to a project."
            : "Connect your Google account to pick emails (and their attachments) into Conversations."}
        </p>
        <div className="flex gap-2">
          {connected ? (
            <>
              <Link href="/brain?tab=conversations">
                <Button variant="outline" data-testid="button-manage-gmail">
                  Manage in Conversations
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
                data-testid="button-disconnect-gmail"
              >
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              data-testid="button-connect-gmail"
            >
              <LogIn className="h-4 w-4 mr-2" /> Connect Gmail
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Linear connects through Replit's Linear connector (not an OAuth redirect),
// so it gets its own card with connect/disconnect controls.
const LinearIntegrationCard = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: status, isLoading } = useQuery<{
    connected: boolean;
    connectorAvailable: boolean;
    teams: { id: string; name: string }[];
  }>({
    queryKey: ["/api/integrations/linear/status"],
  });

  const connect = useMutation({
    mutationFn: () =>
      apiRequest("/api/integrations/linear/connect", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Linear connected" });
      queryClient.invalidateQueries({
        queryKey: ["/api/integrations/linear/status"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: (e: any) =>
      toast({
        title: "Could not connect Linear",
        description:
          e?.message ||
          "Connect Linear in Replit first, then try again.",
        variant: "destructive",
      }),
  });

  const disconnect = useMutation({
    mutationFn: () =>
      apiRequest("/api/integrations/linear/disconnect", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Linear disconnected" });
      queryClient.invalidateQueries({
        queryKey: ["/api/integrations/linear/status"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
  });

  const connected = !!status?.connected;
  return (
    <Card data-testid="card-linear-integration">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-violet-50 flex items-center justify-center">
            <SiLinear className="h-5 w-5 text-violet-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Linear</CardTitle>
              {isLoading ? null : connected ? (
                <Badge
                  variant="secondary"
                  className="bg-green-100 text-green-800"
                >
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )}
            </div>
            <CardDescription>
              Export AI-generated projects and tasks to Linear
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {connected && status?.teams?.length ? (
          <p className="text-xs text-gray-600 mb-2" data-testid="text-linear-team">
            Default team:{" "}
            <span className="font-medium">{status.teams[0].name}</span>
          </p>
        ) : null}
        <p className="text-sm text-gray-600 mb-3">
          {connected
            ? "When you create a project plan, choose 'Export to Linear' to push it into your Linear workspace."
            : "Connect Linear to push project plans straight into your Linear workspace as a project with issues."}
        </p>
        <div className="flex gap-2">
          {connected ? (
            <Button
              variant="outline"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              data-testid="button-disconnect-linear"
            >
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              data-testid="button-connect-linear"
            >
              <LogIn className="h-4 w-4 mr-2" /> Connect Linear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const ConnectIntegrationCard = ({
  provider,
}: {
  provider: IntegrationProvider;
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Get the authentication URL for the provider
  const getAuthUrl = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest(`/api/integrations/auth/${provider}`, {
        method: "GET",
      } as any);
      window.location.href = response.authUrl;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate authentication URL. Please try again.",
        variant: "destructive",
      });
      console.error("Error getting auth URL:", error);
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <ProviderInfo provider={provider} isConnected={false} />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500">
          Connect your account to sync projects and tasks between Requisor and{" "}
          {provider}.
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={getAuthUrl} disabled={isLoading}>
          {isLoading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <LogIn className="mr-2 h-4 w-4" />
              Connect
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

// Main Integrations Page
const IntegrationsPage = () => {
  const { toast } = useToast();

  // Query to get all integrations
  const {
    data: integrations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["/api/integrations"],
    queryFn: async () => {
      return apiRequest("/api/integrations") as any;
    },
  });

  if (error) {
    toast({
      title: "Error",
      description: "Failed to load integrations. Please refresh the page.",
      variant: "destructive",
    });
  }

  // Get list of providers that are not yet connected
  const getUnconnectedProviders = () => {
    const connectedProviders = (integrations || []).map(
      (integration: Integration) => integration.provider,
    );

    return Object.values(IntegrationProvider).filter(
      (provider) =>
        provider !== IntegrationProvider.LINEAR &&
        !connectedProviders.includes(provider),
    );
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6 p-6">
        <div>
          <h1 className="text-3xl font-bold">Integrations</h1>
          <p className="text-gray-500">
            Connect Requisor with your favorite project management tools
          </p>
        </div>
        <Link href="/projects">
          <Button variant="outline">Back to Projects</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p>Loading integrations...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Connected Integrations */}
          {integrations && integrations.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">
                Connected Platforms
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {integrations
                  .filter(
                    (integration: Integration) =>
                      integration.provider !== IntegrationProvider.LINEAR,
                  )
                  .map((integration: Integration) => (
                    <IntegrationCard
                      key={integration.id}
                      integration={integration}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Gmail (Task #84) — same connect/disconnect controls as the Brain
              → Conversations surface, with the connected account email shown
              so users can verify they're linked to the right inbox. */}
          <div>
            <h2 className="text-xl font-semibold mb-4 p-6 pb-0">
              Inbox & Connected Apps
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6">
              <GmailIntegrationCard />
              <LinearIntegrationCard />
            </div>
          </div>

          {/* Available Integrations */}
          {getUnconnectedProviders().length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 p-6">
                Available Platforms
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {getUnconnectedProviders().map((provider) => (
                  <ConnectIntegrationCard key={provider} provider={provider} />
                ))}
              </div>
            </div>
          )}

          {/* Informational Section */}
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mt-8">
            <h3 className="text-lg font-semibold mb-2">About Integrations</h3>
            <p className="text-sm text-gray-600 mb-4">
              Integrations allow you to sync your projects and tasks between
              Requisor and external project management platforms. You can:
            </p>
            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
              <li>Import projects and tasks from external platforms</li>
              <li>Push Requisor tasks to connected platforms</li>
              <li>Keep your project data in sync across multiple tools</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegrationsPage;
