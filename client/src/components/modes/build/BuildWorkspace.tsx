import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Loader2,
  Lightbulb,
  Search,
  Sparkles,
  ExternalLink,
  History,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  TranscriptContextPanel,
  type ContextItem,
} from "./TranscriptContextPanel";
import { FeatureCandidateCard } from "./FeatureCandidateCard";
import { getConversationContextText } from "@/components/meetings/ConversationSelector";
import type { Conversation } from "@shared/schema";

interface BuildMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  features?: any[];
}

interface BuildWorkspaceProps {
  onSwitchToPlan: () => void;
}

export function BuildWorkspace({ onSwitchToPlan }: BuildWorkspaceProps) {
  const [messages, setMessages] = useState<BuildMessage[]>([
    {
      id: "welcome",
      content:
        "Welcome to Build Mode! I help you discover what to build next based on evidence.\n\nImport meeting transcripts, upload files, or paste notes in the left panel. Then ask me questions like:\n- \"What should we build next?\"\n- \"What problems are users facing?\"\n- \"What patterns do you see in these transcripts?\"",
      role: "assistant",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [selectedConversationIds, setSelectedConversationIds] = useState<number[]>([]);
  const [sessionCandidateIds, setSessionCandidateIds] = useState<number[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: allConversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: featureCandidates = [], isLoading: candidatesLoading } =
    useQuery({
      queryKey: ["/api/feature-candidates"],
      enabled: showHistory || sessionCandidateIds.length > 0,
    });

  const sessionCandidates = showHistory
    ? (featureCandidates as any[])
    : (featureCandidates as any[]).filter((c: any) =>
        sessionCandidateIds.includes(c.id),
      );

  const hasSessionFeatures = sessionCandidateIds.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildChatMutation = useMutation({
    mutationFn: async (message: string) => {
      const contextParts: string[] = [];

      const fileContextText = contextItems
        .map((item) => `[${item.type.toUpperCase()}: ${item.title}]\n${item.content}`)
        .join("\n\n---\n\n");
      if (fileContextText) contextParts.push(fileContextText);

      const convContextText = getConversationContextText(allConversations, selectedConversationIds);
      if (convContextText) contextParts.push(convContextText);

      const fullContext = contextParts.join("\n\n===\n\n") || undefined;

      return await apiRequest("/api/ai/build-chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          context: fullContext,
        }),
      });
    },
    onSuccess: (data) => {
      const assistantMessage: BuildMessage = {
        id: Date.now().toString(),
        content: data.text,
        role: "assistant",
        timestamp: new Date(),
        features: data.features,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      if (data.features && data.features.length > 0) {
        saveFeatures(data.features);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process your request",
        variant: "destructive",
      });
    },
  });

  const saveFeatures = async (features: any[]) => {
    const newIds: number[] = [];
    let savedAny = false;
    for (const feature of features) {
      try {
        const result = await apiRequest("/api/feature-candidates", {
          method: "POST",
          body: JSON.stringify({
            featureTitle: feature.feature_title,
            whyNow: feature.why_now,
            evidence: feature.evidence || [],
            uiChanges: feature.ui_changes,
            dataModelChanges: feature.data_model_changes,
            workflowChanges: feature.workflow_changes,
            tasks: feature.tasks || [],
            sourceContext: contextItems.map((c) => c.title).join(", "),
          }),
        });
        savedAny = true;
        if (result && result.id) {
          newIds.push(result.id);
        }
      } catch (e) {
        console.error("Failed to save feature candidate:", e);
      }
    }
    if (newIds.length > 0) {
      setSessionCandidateIds((prev) => [...prev, ...newIds]);
    } else if (savedAny) {
      setShowHistory(true);
    }
    queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
  };

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/feature-candidates/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Feature approved!",
        description:
          "A new project has been created in Plan Mode with the feature tasks.",
      });
      onSwitchToPlan();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve feature candidate",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/feature-candidates/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
    },
  });

  const handleSend = () => {
    if (!input.trim() || buildChatMutation.isPending) return;

    const userMessage: BuildMessage = {
      id: Date.now().toString(),
      content: input.trim(),
      role: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    buildChatMutation.mutate(input.trim());
    setInput("");
  };

  const renderMessageContent = (content: string) => {
    const cleaned = content.replace(/```json[\s\S]*?```/g, "").trim();
    return cleaned || content;
  };

  const quickPrompts = [
    { text: "What should we build next?", icon: Lightbulb },
    { text: "What problems are users facing?", icon: Search },
    { text: "Identify product opportunities", icon: Sparkles },
  ];

  const showCandidatesPanel = hasSessionFeatures || showHistory;

  return (
    <div className="flex h-full gap-4">
      <div className="w-72 flex-shrink-0">
        <TranscriptContextPanel
          contextItems={contextItems}
          onContextChange={setContextItems}
          selectedConversationIds={selectedConversationIds}
          onConversationSelectionChange={setSelectedConversationIds}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4 pb-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-orange-500 text-white"
                      : "bg-white border border-slate-200 text-slate-700"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">
                    {renderMessageContent(msg.content)}
                  </p>
                  {msg.features && msg.features.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                        <span className="text-xs font-medium text-slate-500">
                          {msg.features.length} feature(s) identified & saved
                        </span>
                      </div>
                      {msg.features.map((f: any, i: number) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="mr-1 mb-1 text-xs border-orange-200 text-orange-700"
                        >
                          {f.feature_title}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {buildChatMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing your context and discovering opportunities...
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {messages.length === 1 && contextItems.length === 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {quickPrompts.map((prompt, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="text-xs border-orange-200 text-orange-700 hover:bg-orange-50"
                onClick={() => {
                  setInput(prompt.text);
                }}
              >
                <prompt.icon className="h-3 w-3 mr-1" />
                {prompt.text}
              </Button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about what to build next..."
            className="resize-none text-sm min-h-[44px] max-h-[120px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || buildChatMutation.isPending}
            className="bg-orange-500 hover:bg-orange-600 h-11 px-4"
          >
            {buildChatMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {showCandidatesPanel ? (
        <div className="w-72 flex-shrink-0">
          <Card className="border-slate-200 h-full">
            <div className="p-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-orange-500" />
                  {showHistory ? "All Candidates" : "Session Discoveries"}
                </h3>
                <Badge variant="outline" className="text-xs">
                  {sessionCandidates.filter(
                    (c: any) => c.status !== "approved",
                  ).length}{" "}
                  pending
                </Badge>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-slate-400">
                  {showHistory
                    ? "Showing all past discoveries"
                    : "Features found this session"}
                </p>
                {showHistory ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-slate-400 hover:text-slate-600"
                    onClick={() => setShowHistory(false)}
                  >
                    <X className="h-3 w-3 mr-0.5" />
                    Close
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-slate-400 hover:text-slate-600"
                    onClick={() => setShowHistory(true)}
                  >
                    <History className="h-3 w-3 mr-0.5" />
                    History
                  </Button>
                )}
              </div>
            </div>
            <ScrollArea className="h-[calc(100%-72px)]">
              <div className="p-3 space-y-3">
                {candidatesLoading ? (
                  <div className="text-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" />
                  </div>
                ) : sessionCandidates.length === 0 ? (
                  <div className="text-center py-6">
                    <Lightbulb className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-xs text-slate-400">
                      {showHistory
                        ? "No features discovered yet."
                        : "No features found this session."}
                    </p>
                    <p className="text-xs text-slate-400">
                      {showHistory
                        ? "Start a conversation to discover features."
                        : "Add context and ask the AI to analyze it."}
                    </p>
                  </div>
                ) : (
                  sessionCandidates.map((candidate: any) => (
                    <FeatureCandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      onApprove={(id) => approveMutation.mutate(id)}
                      onDelete={(id) => deleteMutation.mutate(id)}
                      isApproving={approveMutation.isPending}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>
      ) : (
        <div className="w-72 flex-shrink-0">
          <Card className="border-slate-200 h-full border-dashed">
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                <Lightbulb className="h-6 w-6 text-slate-300" />
              </div>
              <h3 className="text-sm font-medium text-slate-500 mb-1">
                Feature Candidates
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Discovered features will appear here as you analyze transcripts and feedback with the AI.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-slate-500 border-slate-200"
                onClick={() => setShowHistory(true)}
              >
                <History className="h-3 w-3 mr-1.5" />
                View Past Discoveries
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
