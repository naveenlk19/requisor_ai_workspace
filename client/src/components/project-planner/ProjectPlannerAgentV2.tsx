import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { mergePlansClient } from "@/utils/plan-merge";
import { useUpgradeModal } from "@/hooks/useUpgradeModal";
import {
  Brain,
  Send,
  Bot,
  Loader2,
  Rocket,
  Target,
  Calendar,
  Upload,
  FileText,
  X,
  MessageSquare,
  Plus,
  History,
  Settings,
  Bookmark,
  Archive,
  Users,
  BarChart3,
  Clock,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Quote,
  Search,
  ArrowRight,
} from "lucide-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";
import { ProjectPlannerCanvasV2 } from "./ProjectPlannerCanvasV2";
import { useDropzone, type FileRejection } from "react-dropzone";
import { safeFormatDate } from "@/lib/utils";
import { MessageFeedback } from "@/components/ai-chat/MessageFeedback";
import {
  QualityHint,
  buildImprovePrompt,
} from "@/components/ai-chat/QualityHint";
import type { ResponseQuality } from "@shared/ai-types";
import {
  RenderWithCitations,
  SourcesFooter,
  type Citation,
} from "@/components/ai-chat/Citations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { ModeToggle, type AppMode } from "@/components/modes/build/ModeToggle";
import { FeatureCandidateCard } from "@/components/modes/build/FeatureCandidateCard";
import { PriorityMatrix } from "@/components/modes/build/PriorityMatrix";
import { PromptPills } from "@/components/modes/build/PromptPills";
import { ExportReport } from "@/components/modes/build/ExportReport";
import { SendToAgentDialog } from "@/components/modes/build/SendToAgentDialog";
import { Code2 } from "lucide-react";
import {
  ConversationSelector,
  getConversationContextText,
} from "@/components/meetings/ConversationSelector";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Conversation, EvidenceItem } from "@shared/schema";
import { Library, Check, Sparkles, Wand2 } from "lucide-react";
import { usePastDiscoveriesFilter } from "@/hooks/usePastDiscoveriesFilter";
import { PromptRefinerDialog } from "@/components/ai-chat/PromptRefinerDialog";

interface FeatureInsight {
  theme: string;
  root_cause: string;
  supporting_quotes: string[];
}

interface BuildFeature {
  feature_title: string;
  why_now: string;
  evidence: string[];
  ui_changes?: string;
  data_model_changes?: string;
  workflow_changes?: string;
  insights?: FeatureInsight[];
  reasoning_chain?: string;
  tasks?: Array<{ name: string; description: string; priority: string }>;
}

interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  projectPlan?: ProjectPlan;
  attachments?: FileAttachment[];
  clarifications?: string[];
  suggestions?: string[];
  sessionId?: string;
  buildFeatures?: BuildFeature[];
  // Task #93 — hybrid retrieval chunk IDs used for this assistant turn.
  retrievedChunkIds?: number[];
  // Task #94 — inline citations.
  citations?: Citation[];
  citationsEmitted?: number;
  citationsStripped?: number;
  // Task #104 — fail-open response quality scores for this assistant turn.
  quality?: ResponseQuality;
}

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  parser?: {
    parserUsed: "fast" | "unstructured";
    pageCount?: number;
    tableCount?: number;
    imageCount?: number;
    note?: string;
  };
}

interface Task {
  id: string;
  name: string;
  description?: string;
  dueDate: string;
  priority: "high" | "medium" | "low";
  status?: string;
  assignee?: string;
}

interface Milestone {
  id: string;
  name: string;
  description?: string;
  dueDate: string;
  tasks: Task[];
}

interface ProjectPlan {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  milestones: Milestone[];
}

interface PromptSuggestion {
  icon: any;
  text: string;
  color: string;
}

export function ProjectPlannerAgentV2() {
  const getWelcomeMessage = (mode: AppMode): ChatMessage => ({
    id: "welcome",
    content:
      mode === "build"
        ? "Ready to discover what to build next. Paste a meeting transcript, upload feedback files, or describe what you're hearing from users — I'll identify the most impactful features to ship."
        : "Ready to plan your project. Describe your idea or upload requirements — I'll create a structured, actionable plan with milestones and tasks.",
    role: "assistant",
    timestamp: new Date(),
  });

  const [messages, setMessages] = useState<ChatMessage[]>([
    getWelcomeMessage("plan"),
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<ProjectPlan | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<FileAttachment[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeView, setActiveView] = useState<
    "chat" | "history" | "templates" | "analytics" | "settings" | "saved"
  >("chat");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [projectNameInput, setProjectNameInput] = useState("");
  const [projectToSave, setProjectToSave] = useState<ProjectPlan | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(
    "Analyzing your project requirements...",
  );
  const [appMode, setAppMode] = useState<AppMode>("plan");
  const [isTyping, setIsTyping] = useState(false);
  const [brainContextCount, setBrainContextCount] = useState(0);
  const [useContextBrain, setUseContextBrain] = useState(true);
  const [recentlyApprovedProjectId, setRecentlyApprovedProjectId] = useState<
    number | null
  >(null);
  const [postApprovalCandidate, setPostApprovalCandidate] = useState<{
    id: number;
    featureTitle: string;
    status: string;
    whyNow?: string | null;
    evidence?: string[] | null;
    uiChanges?: string | null;
    dataModelChanges?: string | null;
    workflowChanges?: string | null;
    tasks?: Array<{
      name?: string;
      title?: string;
      description?: string;
      priority?: string;
    }>;
  } | null>(null);
  const [postApprovalAgentDialogOpen, setPostApprovalAgentDialogOpen] =
    useState(false);
  const [showPromptRefiner, setShowPromptRefiner] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isWindowDragging, setIsWindowDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const windowDragCounterRef = useRef(0);
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { showUpgrade } = useUpgradeModal();

  // Query for fetching chat sessions
  const {
    data: chatSessions,
    isLoading: sessionsLoading,
    refetch: refetchSessions,
    error: sessionsError,
  } = useQuery({
    queryKey: ["/api/ai/chat-sessions"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/ai/chat-sessions", {
          credentials: "include",
        });
        if (!response.ok) {
          if (response.status === 401) return [];
          throw new Error("Failed to fetch chat sessions");
        }
        return response.json();
      } catch (error) {
        console.warn(
          "Failed to fetch chat sessions, returning empty array:",
          error,
        );
        return [];
      }
    },
    retry: false,
  });

  // Auto-restore session persistence on component mount.
  // Guarded so it runs only ONCE — otherwise clearing sessionId during a
  // deliberate action (switching modes, "New Chat") would re-trigger this
  // effect and restore the most recent (Plan) session, snapping the user back
  // out of Build mode.
  const hasAutoRestoredRef = useRef(false);
  useEffect(() => {
    const autoRestoreSession = async () => {
      if (hasAutoRestoredRef.current) return;
      const savedSessionId = localStorage.getItem("last-agent-session-id");
      if (chatSessions && chatSessions.length > 0 && !sessionId) {
        const sessionToRestore =
          (savedSessionId &&
            (chatSessions as any[]).find(
              (s: any) => s.sessionId === savedSessionId,
            )) ||
          chatSessions[0];

        if (sessionToRestore) {
          hasAutoRestoredRef.current = true;
          await loadChatHistory(sessionToRestore.sessionId);
          localStorage.setItem(
            "last-agent-session-id",
            sessionToRestore.sessionId,
          );
          toast({
            title: "Chat History Restored",
            description:
              "Your previous conversation has been automatically restored.",
            duration: 3000,
          });
        }
      }
    };
    if (!sessionsLoading && !loadingHistory) autoRestoreSession();
  }, [chatSessions, sessionsLoading, sessionId, loadingHistory]);

  // Predefined quick prompt suggestions (kept for future use)
  const [promptSuggestions] = useState<PromptSuggestion[]>([
    {
      icon: FileText,
      text: "Analyze client RFP document",
      color: "text-emerald-600",
    },
    {
      icon: Users,
      text: "Extract stakeholder requirements",
      color: "text-blue-600",
    },
    {
      icon: Target,
      text: "Create enterprise implementation plan",
      color: "text-purple-600",
    },
    {
      icon: BarChart3,
      text: "Process compliance documentation",
      color: "text-orange-600",
    },
  ]);

  // Load chat history for a specific session
  const loadChatHistory = async (sessionIdToLoad: string) => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/ai/chat-history/${sessionIdToLoad}`, {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) {
          toast({
            title: "Authentication Required",
            description: "Please log in to access chat history",
            variant: "destructive",
          });
          return;
        }
        throw new Error("Failed to load chat history");
      }

      const history = await response.json();
      const historyMessages: ChatMessage[] = history.map((msg: any) => ({
        id: msg.id.toString(),
        content: msg.content,
        role: msg.role,
        timestamp: new Date(msg.timestamp),
        projectPlan: msg.projectCanvas,
        suggestions: msg.suggestions,
        clarifications: msg.clarifications,
        citations: msg.citations,
      }));

      const sessionMeta = (chatSessions as any[] | undefined)?.find(
        (s: any) => s.sessionId === sessionIdToLoad,
      );
      const sessionMode: AppMode =
        sessionMeta?.mode === "build" ? "build" : "plan";
      setAppMode(sessionMode);

      setMessages([
        {
          id: "welcome",
          content:
            sessionMode === "build"
              ? "Welcome back! Here's your previous Build Mode conversation."
              : "Welcome back! Here's your previous Plan Mode conversation.",
          role: "assistant",
          timestamp: new Date(),
        },
        ...historyMessages,
      ]);
      setSessionId(sessionIdToLoad);
      localStorage.setItem("last-agent-session-id", sessionIdToLoad);

      resetBuildSessionState();

      if (sessionMode === "build") {
        // Restore the feature candidates discovered in this Build conversation.
        try {
          const candRes = await fetch(
            `/api/feature-candidates?sessionId=${encodeURIComponent(sessionIdToLoad)}`,
            { credentials: "include" },
          );
          if (candRes.ok) {
            const sessionCandidates = await candRes.json();
            const ids = (sessionCandidates as any[])
              .map((c: any) => c.id)
              .filter((id: any) => typeof id === "number");
            if (ids.length > 0) setBuildSessionCandidateIds(ids);
          }
        } catch (e) {
          console.warn("[Build Mode] Failed to restore session candidates:", e);
        }
      } else {
        const lastMessage = historyMessages[historyMessages.length - 1];
        if (lastMessage?.projectPlan) setCurrentPlan(lastMessage.projectPlan);
      }
    } catch (error) {
      console.error("Error loading chat history:", error);
      toast({
        title: "Error",
        description: "Failed to load chat history",
        variant: "destructive",
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  // Start a new chat session
  const startNewChat = async () => {
    // Starting a new chat is a deliberate action; cancel any pending mount
    // auto-restore so it can't override the fresh session.
    hasAutoRestoredRef.current = true;
    try {
      const response = await fetch("/api/ai/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: appMode }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setSessionId(null);
          setMessages([getWelcomeMessage(appMode)]);
          setCurrentPlan(null);
          pendingFilesRef.current.clear();
          setUploadedFiles([]);
          return;
        }
        throw new Error("Failed to create new session");
      }

      const result = await response.json();
      setSessionId(result.sessionId);
      setMessages([getWelcomeMessage(appMode)]);
      setCurrentPlan(null);
      pendingFilesRef.current.clear();
      setUploadedFiles([]);
      setRecentlyApprovedProjectId(null);
      setPostApprovalCandidate(null);
      setPostApprovalAgentDialogOpen(false);
      resetBuildSessionState();
      setShowBuildHistory(false);
      setBatchSelectionMode(false);
      setSelectedCandidateIds([]);
      setSelectedConversationIds([]);
      setSelectedEvidenceIds([]);
      localStorage.setItem("last-agent-session-id", result.sessionId);
      refetchSessions();
    } catch (error) {
      console.error("Error creating new session:", error);
      toast({
        title: "Error",
        description: "Failed to start new chat",
        variant: "destructive",
      });
    }
  };

  // Handle file drops/uploads - stores context for combining with user input
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    setAttachmentError(null);
    const newFiles: FileAttachment[] = acceptedFiles.map((file) => {
      const id = `file_${Date.now()}_${Math.random()}`;
      pendingFilesRef.current.set(id, file);
      return {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
      };
    });
    setUploadedFiles((prev) => [...prev, ...newFiles]);
    toast({
      title:
        newFiles.length === 1
          ? "Attachment ready"
          : `${newFiles.length} attachments ready`,
      description: "Add a message and press Send to share it with the agent.",
    });
  };
  // Process staged attachments on send: upload to /api/ai/process-files,
  // capture the extracted text into fileContext, and auto-save as evidence.
  // Returns the extracted context (or "" if nothing to process / on error).
  const processPendingAttachmentsOnSend = async (): Promise<string> => {
    const ids = Array.from(pendingFilesRef.current.keys());
    if (ids.length === 0) return "";
    const files = ids
      .map((id) => pendingFilesRef.current.get(id))
      .filter((f): f is File => !!f);
    if (files.length === 0) return "";
    setIsProcessingFiles(true);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/ai/process-files", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to process files");

      const result = await response.json();

      // Store the file context for combining with user text input
      const extractedContext: string =
        result.generatedPrompt || result.summary || result.fileContent || "";

      setFileContext(extractedContext);

      // Surface per-file parser info (fast vs Unstructured + stats) on the
      // staged attachment chips so users see when richer extraction kicked in.
      const parserByName = new Map<string, FileAttachment["parser"]>();
      // Map the signed upload token returned by /api/ai/process-files (by index,
      // aligned with the order files were appended) so we can attach the stored
      // original to the evidence item and enable "download original".
      const tokensByIndex: Array<string | undefined> = Array.isArray(
        result.processedFiles,
      )
        ? result.processedFiles.map((pf: any) => pf?.uploadToken)
        : [];
      if (Array.isArray(result.processedFiles)) {
        for (const pf of result.processedFiles) {
          if (pf?.fileName && pf.parser) {
            parserByName.set(pf.fileName, pf.parser);
          }
        }
        setUploadedFiles((prev) =>
          prev.map((att) => {
            const p = parserByName.get(att.name);
            return p ? { ...att, parser: p } : att;
          }),
        );
      }

      // const fileMessage: ChatMessage = {
      //   id: Date.now().toString(),
      //   content: `I've analyzed the uploaded files. ${result.summary || "I found relevant project information."}\n\nPlease describe what you'd like to do with this content, or type "generate plan" to create a project plan from the files.`,
      //   role: "assistant",
      //   timestamp: new Date(),
      //   projectPlan: result.projectCanvas || result.projectPlan,
      // };

      // setMessages((prev) => [...prev, fileMessage]);

      // Only set plan if a complete one was extracted directly
      if (result.projectCanvas || result.projectPlan) {
        setCurrentPlan(result.projectCanvas || result.projectPlan);
      }

      // Auto-save uploaded files as evidence items
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const uploadToken = tokensByIndex[i];
          await fetch("/api/evidence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              title: file.name,
              content:
                extractedContext.slice(0, 5000) ||
                `Uploaded file: ${file.name}`,
              source: "file",
              tags: ["auto-imported"],
              metadata: {
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
              },
              ...(uploadToken ? { uploadToken } : {}),
            }),
          });
        } catch (e) {
          console.warn("Failed to auto-save evidence for file:", file.name, e);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      return extractedContext;
    } catch (error) {
      console.error("Error processing files on send:", error);
      toast({
        title: "Error",
        description: "Failed to process attached files. Sending message only.",
        variant: "destructive",
      });
      return "";
    } finally {
      ids.forEach((id) => pendingFilesRef.current.delete(id));
      setIsProcessingFiles(false);
    }
  };

  const acceptedFileTypes = {
    "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
    "application/pdf": [".pdf"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
      ".docx",
    ],
    "application/vnd.ms-excel": [".xls"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
      ".xlsx",
    ],
    "application/vnd.ms-powerpoint": [".ppt"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      [".pptx"],
    "application/rtf": [".rtf"],
    "text/rtf": [".rtf"],
    "application/json": [".json"],
    "text/xml": [".xml"],
    "application/xml": [".xml"],
    "text/plain": [".txt"],
    "text/csv": [".csv"],
    "application/x-subrip": [".srt"],
    "text/srt": [".srt"],
  };
  const maxFileSize = 100 * 1024 * 1024; // 100MB

  const fileMatchesAccept = (file: File) => {
    const lowerName = file.name.toLowerCase();
    for (const [mime, exts] of Object.entries(acceptedFileTypes)) {
      if (mime.endsWith("/*")) {
        const prefix = mime.slice(0, -1);
        if (file.type.startsWith(prefix)) return true;
      } else if (file.type && file.type === mime) {
        return true;
      }
      if (exts.some((ext) => lowerName.endsWith(ext.toLowerCase()))) {
        return true;
      }
    }
    return false;
  };

  const handleRejectedFiles = useCallback((rejections: FileRejection[]) => {
    const names = rejections
      .map((r) => r.file?.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");
    const tooBig = rejections.some((r) =>
      r.errors.some((e) => e.code === "file-too-large"),
    );
    const message = tooBig
      ? `${names || "Some files"} are over the 100MB limit.`
      : `Couldn't attach ${names || "those files"}. Supported: images, PDF, Office docs, text/CSV/JSON/XML/RTF, and .srt subtitles.`;
    setAttachmentError(message);
    toast({
      title: tooBig ? "File too large" : "Unsupported file type",
      description: message,
      variant: "destructive",
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: acceptedFileTypes,
    maxSize: maxFileSize,
    disabled: isProcessingFiles,
    noClick: true,
    noKeyboard: true,
    onDropRejected: handleRejectedFiles,
  });

  // Window-level drag listener so users get a visible target when dragging
  // files in from outside the browser tab. Drops anywhere on the page route
  // through the same accept/maxSize validation as the chat dropzone.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      for (let i = 0; i < types.length; i++) {
        if (types[i] === "Files") return true;
      }
      return false;
    };

    const handleDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      windowDragCounterRef.current += 1;
      setIsWindowDragging(true);
    };
    const handleDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const handleDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      windowDragCounterRef.current = Math.max(
        0,
        windowDragCounterRef.current - 1,
      );
      if (windowDragCounterRef.current === 0) {
        setIsWindowDragging(false);
      }
    };
    const handleDrop = () => {
      windowDragCounterRef.current = 0;
      setIsWindowDragging(false);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  const validateFiles = (files: File[]) => {
    const accepted: File[] = [];
    const rejected: FileRejection[] = [];
    for (const file of files) {
      const errors: Array<{ code: string; message: string }> = [];
      if (file.size > maxFileSize) {
        errors.push({
          code: "file-too-large",
          message: `File is larger than ${maxFileSize} bytes`,
        });
      }
      if (!fileMatchesAccept(file)) {
        errors.push({
          code: "file-invalid-type",
          message: "File type not accepted",
        });
      }
      if (errors.length === 0) {
        accepted.push(file);
      } else {
        rejected.push({ file, errors });
      }
    }
    return { accepted, rejected };
  };

  const handleWindowDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    windowDragCounterRef.current = 0;
    setIsWindowDragging(false);
    if (isProcessingFiles) return;
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (!files.length) return;

    const { accepted, rejected } = validateFiles(files);
    if (rejected.length) handleRejectedFiles(rejected);
    if (accepted.length) void onDrop(accepted);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isProcessingFiles) return;
    const items = e.clipboardData?.items;
    const files: File[] = [];
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    if (!files.length) return;
    e.preventDefault();

    const { accepted, rejected } = validateFiles(files);
    if (rejected.length) handleRejectedFiles(rejected);
    if (accepted.length) {
      void onDrop(accepted);
      const names = accepted
        .map((f) => f.name)
        .slice(0, 3)
        .join(", ");
      toast({
        title:
          accepted.length === 1
            ? "Attachment added"
            : `${accepted.length} attachments added`,
        description:
          accepted.length === 1
            ? `Pasted ${accepted[0].name}`
            : `Pasted ${names}${accepted.length > 3 ? "…" : ""}`,
      });
    }
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Update canvas when projectPlan arrives
  useEffect(() => {
    if (currentPlan) return;
    const firstAssistantWithPlan = messages.find(
      (m) => m.role === "assistant" && m.projectPlan,
    );
    if (firstAssistantWithPlan?.projectPlan) {
      setCurrentPlan(firstAssistantWithPlan.projectPlan);
    }
  }, [messages, currentPlan]);

  // Persist session in localStorage
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem("requisor_current_session", sessionId);
      const sessionData = {
        sessionId,
        messages: messages.slice(0, 50),
        currentPlan,
        lastUpdated: new Date().toISOString(),
      };
      localStorage.setItem(
        `requisor_session_${sessionId}`,
        JSON.stringify(sessionData),
      );
    }
  }, [sessionId, messages, currentPlan]);

  // Load session from localStorage on mount
  useEffect(() => {
    const savedSessionId = localStorage.getItem("requisor_current_session");
    if (savedSessionId && !sessionId) {
      const sessionDataStr = localStorage.getItem(
        `requisor_session_${savedSessionId}`,
      );
      if (sessionDataStr) {
        try {
          const sessionData = JSON.parse(sessionDataStr);
          const lastUpdated = new Date(sessionData.lastUpdated);
          const hoursSinceUpdate =
            (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
          if (hoursSinceUpdate < 24) {
            setSessionId(sessionData.sessionId);
            setMessages(
              sessionData.messages.map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp),
              })),
            );
            if (sessionData.currentPlan)
              setCurrentPlan(sessionData.currentPlan);
          } else {
            localStorage.removeItem("requisor_current_session");
            localStorage.removeItem(`requisor_session_${savedSessionId}`);
          }
        } catch (e) {
          console.error("Error loading saved session:", e);
        }
      }
    }
  }, []);

  const generateProjectPlan = useMutation({
    mutationFn: async ({
      message,
      isUpdate,
      currentPlan: existingPlan,
    }: {
      message: string;
      isUpdate: boolean;
      currentPlan: ProjectPlan | null;
    }) => {
      try {
        let currentSessionId = sessionId;
        if (!currentSessionId) {
          try {
            const sessionResponse = await fetch("/api/ai/chat-sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ mode: "plan" }),
            });
            if (sessionResponse.ok) {
              const sessionResult = await sessionResponse.json();
              currentSessionId = sessionResult.sessionId;
              setSessionId(currentSessionId);
              if (currentSessionId)
                localStorage.setItem("last-agent-session-id", currentSessionId);
            }
          } catch (error) {
            console.warn(
              "Failed to create session, continuing in demo mode:",
              error,
            );
          }
        }

        const msgId = `stream-plan-${Date.now()}`;
        setStreamingMessageId(msgId);
        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            content: "",
            role: "assistant" as const,
            timestamp: new Date(),
          },
        ]);

        const response = await fetch("/api/ai/chat-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            message,
            sessionId: currentSessionId,
            attachments: uploadedFiles,
            existingProject: isUpdate ? existingPlan : undefined,
            useContextBrain,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = "Failed to generate project plan";
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let planData: any = null;
        const allPlans: any[] = [];
        let receivedSessionId: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "text") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId
                      ? { ...m, content: m.content + event.content }
                      : m,
                  ),
                );
              } else if (event.type === "status") {
                setLoadingMessage(event.content || "Processing...");
              } else if (event.type === "session") {
                receivedSessionId = event.sessionId;
                setSessionId(event.sessionId);
                localStorage.setItem("last-agent-session-id", event.sessionId);
              } else if (event.type === "context_trimmed") {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== msgId) return m;
                    if (m.content.includes("sources were trimmed to fit"))
                      return m;
                    return {
                      ...m,
                      content:
                        m.content +
                        "\n\n> *Note: Some attached sources were trimmed to fit the model's context window.*\n",
                    };
                  }),
                );
              } else if (event.type === "context_brain") {
                setBrainContextCount(event.count || 0);
              } else if (event.type === "retrieved_chunks") {
                const ids: number[] = Array.isArray(event.chunkIds)
                  ? event.chunkIds
                  : [];
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId ? { ...m, retrievedChunkIds: ids } : m,
                  ),
                );
              } else if (event.type === "citations") {
                // Task #94 — chips arrive once after streaming text.
                const cites: Citation[] = Array.isArray(event.citations)
                  ? event.citations
                  : [];
                const emitted = Number.isFinite(event.citationsEmitted)
                  ? event.citationsEmitted
                  : cites.length;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId
                      ? {
                          ...m,
                          citations: cites,
                          citationsEmitted: emitted,
                          citationsStripped: m.citationsStripped || 0,
                        }
                      : m,
                  ),
                );
              } else if (event.type === "citations_verified") {
                // Faithfulness verifier verdict — strip the failing N's
                // from the rendered text + chips list.
                const stripNs: number[] = Array.isArray(event.stripNs)
                  ? event.stripNs.map((n: any) => Number(n))
                  : [];
                const stripSet = new Set(stripNs);
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== msgId) return m;
                    const filteredCites = (m.citations || []).filter(
                      (c) => !stripSet.has(c.n),
                    );
                    const cleanedContent = stripSet.size
                      ? m.content.replace(/\[chunk_id:(\d+)\]/g, (full, n) =>
                          stripSet.has(Number(n)) ? "" : full,
                        )
                      : m.content;
                    return {
                      ...m,
                      content: cleanedContent,
                      citations: filteredCites,
                      citationsStripped:
                        (m.citationsStripped || 0) + stripSet.size,
                    };
                  }),
                );
              } else if (event.type === "quality") {
                // Task #104 — fail-open quality scores arrive after the text +
                // citations. Stash on the message so the hint can render.
                const q = event.quality as ResponseQuality | undefined;
                if (q) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === msgId ? { ...m, quality: q } : m,
                    ),
                  );
                }
              } else if (event.type === "plan") {
                if (!planData) planData = event.data;
                allPlans.push(event.data);
              } else if (event.type === "done") {
                if (event.sessionId) {
                  receivedSessionId = event.sessionId;
                  setSessionId(event.sessionId);
                  localStorage.setItem(
                    "last-agent-session-id",
                    event.sessionId,
                  );
                }
              } else if (event.type === "error") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId
                      ? { ...m, content: event.content || "An error occurred." }
                      : m,
                  ),
                );
              }
            } catch {}
          }
        }

        setStreamingMessageId(null);
        return {
          planData,
          isUpdate,
          allPlans,
          existingPlan,
          msgId,
          sessionId: receivedSessionId,
        };
      } catch (error) {
        setStreamingMessageId(null);
        console.error("Fetch error in generateProjectPlan:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      const { planData, isUpdate: wasUpdate, existingPlan, msgId } = data;

      let projectPlan = planData?.projectCanvas || null;

      if (projectPlan && wasUpdate && existingPlan) {
        const diffMetadata = planData?.diff;
        const mergeResult = mergePlansClient(
          existingPlan,
          projectPlan,
          diffMetadata,
        );
        if (mergeResult.warning) {
          toast({
            title: "Plan Merged (Client Fallback)",
            description: mergeResult.warning,
            duration: 5000,
          });
        }
        projectPlan = mergeResult.mergedPlan;

        // Inline confirmation: surface a concise summary of what changed so the user
        // immediately sees that their edit landed in the canvas.
        try {
          const added =
            (diffMetadata?.milestones?.added?.length || 0) +
            (diffMetadata?.tasks?.added?.length || 0);
          const removed =
            (diffMetadata?.milestones?.removed?.length || 0) +
            (diffMetadata?.tasks?.removed?.length || 0);
          const updated =
            (diffMetadata?.milestones?.updated?.length || 0) +
            (diffMetadata?.tasks?.updated?.length || 0);
          const parts: string[] = [];
          if (added) parts.push(`${added} added`);
          if (updated) parts.push(`${updated} updated`);
          if (removed) parts.push(`${removed} removed`);
          if (parts.length === 0) {
            const beforeMs = existingPlan.milestones?.length || 0;
            const afterMs = projectPlan.milestones?.length || 0;
            if (beforeMs !== afterMs)
              parts.push(`${afterMs} milestones (was ${beforeMs})`);
          }
          if (parts.length > 0) {
            toast({
              title: "Plan updated",
              description: parts.join(" • "),
              duration: 3500,
            });
          }
        } catch {}
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                projectPlan,
                clarifications: planData?.clarifications,
                suggestions: planData?.suggestions,
                sessionId: data.sessionId || undefined,
              }
            : m,
        ),
      );
      const extraPlans = (data.allPlans || []).slice(1);
      if (extraPlans.length > 0) {
        const extraMessages: ChatMessage[] = extraPlans.map(
          (p: any, idx: number) => ({
            id: `${msgId}-plan-${idx + 2}`,
            role: "assistant" as const,
            content: `Project ${idx + 2} of ${data.allPlans.length}: ${p?.projectCanvas?.name || "Untitled"}`,
            timestamp: new Date(),
            projectPlan: p?.projectCanvas || null,
            clarifications: p?.clarifications,
            suggestions: p?.suggestions,
            sessionId: data.sessionId || undefined,
          }),
        );
        setMessages((prev) => [...prev, ...extraMessages]);
      }
      setIsTyping(false);
      if (projectPlan) setCurrentPlan(projectPlan);
      if (extraPlans.length > 0) {
        toast({
          title: `Created ${data.allPlans.length} separate projects`,
          description: "Click any plan in the chat to view it on the right.",
          duration: 4000,
        });
      }
      pendingFilesRef.current.clear();
      setUploadedFiles([]);
    },
    onError: (error) => {
      setIsTyping(false);
      setStreamingMessageId(null);
      console.error("Error generating project plan:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to generate project plan",
        variant: "destructive",
      });
    },
  });

  const [buildSessionCandidateIds, setBuildSessionCandidateIds] = useState<
    number[]
  >([]);
  const [pendingBuildFeatures, setPendingBuildFeatures] = useState<
    BuildFeature[]
  >([]);
  const [retryingPending, setRetryingPending] = useState(false);
  const [showBuildHistory, setShowBuildHistory] = useState(false);
  const buildSaveGenerationRef = useRef(0);
  const pendingBuildFeaturesGenerationRef = useRef<number | null>(null);

  // Centralized reset for Build Mode session-boundary state. Bumps the
  // generation token (so any in-flight save callbacks become stale and no-op),
  // clears the pending features tied to that generation, and clears any
  // candidate IDs collected during the previous session.
  //
  // IMPORTANT: Any new code path that switches Build Mode sessions
  // (new chat, loading history, project switching, mode switching, etc.)
  // MUST call this helper. Inlining a subset of these resets has caused
  // race bugs where stale saves bled into the next session.
  const resetBuildSessionState = () => {
    buildSaveGenerationRef.current += 1;
    pendingBuildFeaturesGenerationRef.current = null;
    setPendingBuildFeatures([]);
    setBuildSessionCandidateIds([]);
  };
  const [pastDiscoveriesFilter] = usePastDiscoveriesFilter();
  const [selectedConversationIds, setSelectedConversationIds] = useState<
    number[]
  >([]);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<number[]>([]);
  const [showEvidencePicker, setShowEvidencePicker] = useState(false);
  const [showExportReport, setShowExportReport] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>(
    [],
  );
  const [showBatchAgentDialog, setShowBatchAgentDialog] = useState(false);
  const [batchSelectionMode, setBatchSelectionMode] = useState(false);

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === "e" || e.key === "E")
      ) {
        e.preventDefault();
        if (appMode === "build") {
          if (batchSelectionMode && selectedCandidateIds.length > 0) {
            setShowBatchAgentDialog(true);
          } else {
            setBatchSelectionMode(true);
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [appMode, batchSelectionMode, selectedCandidateIds]);

  const { data: allConversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: featureCandidates = [] } = useQuery({
    queryKey: ["/api/feature-candidates"],
    enabled:
      appMode === "build" &&
      (showBuildHistory ||
        buildSessionCandidateIds.length > 0 ||
        pendingBuildFeatures.length > 0),
  });

  const { data: allEvidenceItems = [] } = useQuery<EvidenceItem[]>({
    queryKey: ["/api/evidence"],
  });

  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [expandedInsights, setExpandedInsights] = useState<
    Record<string, boolean>
  >({});

  const buildChatMutation = useMutation({
    mutationFn: async (message: string) => {
      buildSaveGenerationRef.current += 1;
      const requestGeneration = buildSaveGenerationRef.current;
      const convContextText = getConversationContextText(
        allConversations,
        selectedConversationIds,
      );
      const EVIDENCE_PER_ITEM_CAP = 30000;
      const EVIDENCE_TOTAL_CAP = 90000;
      let evidenceContextText: string | undefined = undefined;
      if (selectedEvidenceIds.length > 0) {
        let evTotal = 0;
        const evParts: string[] = [];
        for (const e of allEvidenceItems.filter((e) =>
          selectedEvidenceIds.includes(e.id),
        )) {
          const remaining = EVIDENCE_TOTAL_CAP - evTotal;
          if (remaining <= 200) break;
          const cap = Math.min(EVIDENCE_PER_ITEM_CAP, remaining);
          let body = e.content;
          if (body.length > cap) {
            const headSize = Math.floor(cap * 0.8);
            const tailSize = cap - headSize - 50;
            const omitted = body.length - headSize - Math.max(tailSize, 0);
            body =
              body.slice(0, headSize) +
              `\n\n…[${omitted.toLocaleString()} chars trimmed]…\n\n` +
              (tailSize > 0 ? body.slice(-tailSize) : "");
          }
          const entry = `[Evidence: ${e.title}] (source: ${e.source})\n${body}`;
          evParts.push(entry);
          evTotal += entry.length;
        }
        evidenceContextText = evParts.join("\n\n---\n\n");
      }
      const recentHistory = messages
        .filter((m) => m.id !== "welcome")
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: m.content.replace(/```json[\s\S]*?```/g, "").trim(),
        }));
      const contextParts = [convContextText, evidenceContextText]
        .filter(Boolean)
        .join("\n\n---\n\n");

      const msgId = `stream-${Date.now()}`;
      setStreamingMessageId(msgId);
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          content: "",
          role: "assistant" as const,
          timestamp: new Date(),
        },
      ]);

      const response = await fetch("/api/ai/build-chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message,
          sessionId,
          context: contextParts || undefined,
          chatHistory: recentHistory,
          useContextBrain,
          sourceEvidenceItemIds: selectedEvidenceIds,
          sourceConversationIds: selectedConversationIds,
          sourceLabels: [
            ...allEvidenceItems
              .filter((e) => selectedEvidenceIds.includes(e.id))
              .map((e) => `Evidence: ${e.title}`),
            ...(allConversations as any[])
              .filter((c: any) => selectedConversationIds.includes(c.id))
              .map((c: any) => `Meeting: ${c.title || "Untitled"}`),
          ],
        }),
      });

      if (!response.ok) throw new Error("Failed to start streaming");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let features: any[] = [];
      let receivedSessionId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "session") {
              receivedSessionId = event.sessionId;
              setSessionId(event.sessionId);
              if (event.sessionId)
                localStorage.setItem("last-agent-session-id", event.sessionId);
            } else if (event.type === "text") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId
                    ? { ...m, content: m.content + event.content }
                    : m,
                ),
              );
            } else if (event.type === "features") {
              features = event.data || [];
              if (process.env.NODE_ENV !== "production") {
                console.log(
                  "[Build Mode] Features received:",
                  features.length,
                  features.map((f: BuildFeature) => ({
                    title: f.feature_title,
                    hasInsights: !!(f.insights && f.insights.length > 0),
                    hasReasoning: !!f.reasoning_chain,
                  })),
                );
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId ? { ...m, buildFeatures: features } : m,
                ),
              );
              if (
                features.length > 0 &&
                buildSaveGenerationRef.current === requestGeneration
              ) {
                pendingBuildFeaturesGenerationRef.current = requestGeneration;
                setPendingBuildFeatures(features);
              }
            } else if (event.type === "context_trimmed") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== msgId) return m;
                  if (m.content.includes("sources were trimmed to fit"))
                    return m;
                  return {
                    ...m,
                    content:
                      m.content +
                      "\n\n> *Note: Some attached sources were trimmed to fit the model's context window.*\n",
                  };
                }),
              );
            } else if (event.type === "context_brain") {
              setBrainContextCount(event.count || 0);
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId
                    ? { ...m, content: event.content || "An error occurred." }
                    : m,
                ),
              );
            }
          } catch {}
        }
      }

      setStreamingMessageId(null);
      return { features, requestGeneration, receivedSessionId };
    },
    onSuccess: (data: any) => {
      setIsTyping(false);
      if (data?.features && data.features.length > 0) {
        saveBuildFeatures(
          data.features,
          data.requestGeneration,
          data.receivedSessionId,
        );
      }
    },
    onError: (error: any) => {
      setIsTyping(false);
      setStreamingMessageId(null);
      toast({
        title: "Error",
        description: error.message || "Failed to process build request",
        variant: "destructive",
      });
    },
  });

  const saveBuildFeatures = async (
    features: BuildFeature[],
    requestGeneration?: number,
    sessionIdForSave?: string | null,
  ) => {
    if (!features || features.length === 0) return;

    const sourceSessionId = sessionIdForSave ?? sessionId ?? undefined;

    const generationAtStart =
      typeof requestGeneration === "number"
        ? requestGeneration
        : buildSaveGenerationRef.current;

    if (buildSaveGenerationRef.current !== generationAtStart) {
      console.warn(
        "[Build Mode] Skipping save — request belongs to an older chat session.",
      );
      return;
    }

    const results = await Promise.allSettled(
      features.map((feature) => {
        const evidenceIds: number[] = Array.isArray(
          (feature as any)._sourceEvidenceItemIds,
        )
          ? (feature as any)._sourceEvidenceItemIds
          : [];
        const conversationIds: number[] = Array.isArray(
          (feature as any)._sourceConversationIds,
        )
          ? (feature as any)._sourceConversationIds
          : [];
        const labels: string[] = Array.isArray((feature as any)._sourceLabels)
          ? Array.from(new Set((feature as any)._sourceLabels as string[]))
          : [];
        const dedupedEvidenceIds = Array.from(new Set(evidenceIds));
        const dedupedConversationIds = Array.from(new Set(conversationIds));
        // Align quotes 1:1 with each source pool. Prefer the per-feature
        // `evidence` strings (the supporting quotes the model emitted); fall
        // back to insight supporting_quotes. The same pool fills both
        // evidenceQuotes and conversationQuotes positionally so each chip in
        // the card can show its referenced quote.
        const evidenceStrings: string[] = Array.isArray(feature.evidence)
          ? feature.evidence.filter((e: any) => typeof e === "string")
          : [];
        const insightQuotes: string[] = Array.isArray(feature.insights)
          ? feature.insights.flatMap((ins: any) =>
              Array.isArray(ins?.supporting_quotes)
                ? ins.supporting_quotes.filter(
                    (q: any) => typeof q === "string",
                  )
                : [],
            )
          : [];
        const quotePool = [...evidenceStrings, ...insightQuotes];
        const evidenceQuotes: string[] = dedupedEvidenceIds.map(
          (_id, i) => quotePool[i] || "",
        );
        // Base the conversation quote offset on the model's actual evidence
        // quote count (not the merged evidence ID length, which can be
        // inflated by brain-auto-injected IDs that have no matching quotes).
        // Otherwise the offset jumps past the end of the pool and every
        // conversation chip ends up with an empty quote.
        const convQuoteOffset = evidenceStrings.length;
        const sourceConversationQuotes: string[] = dedupedConversationIds.map(
          (_id, i) => quotePool[convQuoteOffset + i] || quotePool[i] || "",
        );
        let sourceContext =
          labels.length > 0 ? `chat | From: ${labels.join("; ")}` : "chat";
        if (sourceContext.length > 1900)
          sourceContext = sourceContext.slice(0, 1897) + "...";
        return apiRequest("/api/feature-candidates", {
          method: "POST",
          body: JSON.stringify({
            featureTitle: feature.feature_title,
            whyNow: feature.why_now,
            evidence: feature.evidence || [],
            evidenceItemIds: dedupedEvidenceIds,
            evidenceQuotes,
            sourceConversationIds: dedupedConversationIds,
            sourceConversationQuotes,
            uiChanges: feature.ui_changes,
            dataModelChanges: feature.data_model_changes,
            workflowChanges: feature.workflow_changes,
            tasks: feature.tasks || [],
            sourceContext,
            sourceSessionId,
            insights: feature.insights || [],
            reasoningChain: feature.reasoning_chain || "",
          }),
        });
      }),
    );

    const newIds: number[] = [];
    const failedFeatures: BuildFeature[] = [];
    let firstError: string | null = null;

    results.forEach((res, idx) => {
      if (res.status === "fulfilled") {
        const result = res.value;
        if (result && result.id) {
          newIds.push(result.id);
        }
      } else {
        failedFeatures.push(features[idx]);
        const err: any = res.reason;
        console.error("Failed to save feature candidate:", err);
        if (!firstError) {
          firstError =
            (err && (err.message || err.data?.message)) ||
            "Unknown server error";
        }
      }
    });

    if (buildSaveGenerationRef.current !== generationAtStart) {
      console.warn(
        "[Build Mode] Discarding stale save results — chat session moved on.",
      );
      queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
      return;
    }

    if (newIds.length > 0) {
      setBuildSessionCandidateIds((prev) => [...prev, ...newIds]);
    }

    setPendingBuildFeatures(failedFeatures);
    pendingBuildFeaturesGenerationRef.current =
      failedFeatures.length > 0 ? generationAtStart : null;

    if (failedFeatures.length > 0) {
      toast({
        title:
          failedFeatures.length === features.length
            ? "Couldn't save discovered features"
            : `${failedFeatures.length} of ${features.length} features didn't save`,
        description:
          (firstError ? `${firstError}. ` : "") +
          "They're still visible on the right — tap Retry to try saving again.",
        variant: "destructive",
        action: (
          <ToastAction
            altText="Retry saving features"
            onClick={() => {
              if (buildSaveGenerationRef.current !== generationAtStart) {
                console.warn(
                  "[Build Mode] Ignoring stale retry from a previous chat session.",
                );
                return;
              }
              setRetryingPending(true);
              saveBuildFeatures(failedFeatures, generationAtStart).finally(() =>
                setRetryingPending(false),
              );
            }}
          >
            Retry
          </ToastAction>
        ),
      });
    }

    queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
  };

  const approveFeatureMutation = useMutation({
    mutationFn: async (
      input: number | { id: number; existingProjectId?: number | null },
    ) => {
      const id = typeof input === "number" ? input : input.id;
      const existingProjectId =
        typeof input === "number" ? null : (input.existingProjectId ?? null);
      const result = (await apiRequest(
        `/api/feature-candidates/${id}/approve`,
        {
          method: "POST",
          body: JSON.stringify(existingProjectId ? { existingProjectId } : {}),
        },
      )) as {
        candidate: {
          id: number;
          featureTitle: string;
          status: string;
          whyNow?: string;
          evidence?: string[];
          uiChanges?: string;
          dataModelChanges?: string;
          workflowChanges?: string;
          tasks?: Array<{
            name?: string;
            title?: string;
            description?: string;
            priority?: string;
          }>;
        };
        project: { id: number; name: string };
        addedToExisting?: boolean;
      };
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });

      const projectId = data.project?.id;
      const projectName = data.project?.name || "your new project";
      const candidate = data.candidate;

      const candidateTasks = Array.isArray(candidate?.tasks)
        ? candidate.tasks
        : [];
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 30);
      const approvedPlan: ProjectPlan = {
        name: projectName,
        description: candidate?.whyNow || projectName,
        startDate: today.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        milestones: [
          {
            id: "milestone-1",
            name: "Implementation",
            description: `Tasks for ${projectName}`,
            dueDate: endDate.toISOString().split("T")[0],
            tasks: candidateTasks.map((t, i) => ({
              id: `task-${i + 1}`,
              name: t.name || t.title || `Task ${i + 1}`,
              description: t.description || "",
              dueDate: endDate.toISOString().split("T")[0],
              priority: (t.priority || "medium") as "high" | "medium" | "low",
              status: "todo",
            })),
          },
        ],
      };
      setCurrentPlan(approvedPlan);
      setAppMode("plan");

      const nextStepMessage: ChatMessage = {
        id: `approved-${Date.now()}-${projectId || 0}`,
        content:
          `Feature approved and loaded into the project canvas as **${projectName}**. Here's what you can do next:\n\n` +
          `- **Send to a coding agent** to start implementation\n` +
          `- **View the project** to see tasks and milestones\n` +
          `- **Continue discovering** more features by switching back to Build mode`,
        role: "assistant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, nextStepMessage]);

      if (projectId) {
        setRecentlyApprovedProjectId(projectId);
      }

      if (candidate) {
        setPostApprovalCandidate(candidate);
        setPostApprovalAgentDialogOpen(true);
      }

      toast({
        title: "Feature approved!",
        description: `Project "${projectName}" loaded into canvas. Choose a coding agent to start building.`,
      });
    },
  });

  const deleteFeatureMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/feature-candidates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
    },
  });

  // Cycle through loading messages while generating
  useEffect(() => {
    if (!generateProjectPlan.isPending) {
      setLoadingMessage("Analyzing your project requirements...");
      return;
    }

    const messages = [
      "Analyzing your project requirements...",
      "Identifying key milestones and deliverables...",
      "Breaking down tasks and dependencies...",
      "Estimating timelines and resource needs...",
      "Structuring your project plan...",
      "Finalizing recommendations and next steps...",
    ];

    let currentIndex = 0;
    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % messages.length;
      setLoadingMessage(messages[currentIndex]);
    }, 2000); // Change message every 2 seconds

    return () => clearInterval(interval);
  }, [generateProjectPlan.isPending]);

  const generateSessionTitle = useCallback(
    async (userMessage: string, sid: string) => {
      try {
        await fetch(`/api/ai/chat-sessions/${sid}/title`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ title: userMessage }),
        });
        queryClient.invalidateQueries({ queryKey: ["/api/ai/chat-sessions"] });
      } catch (e) {
        console.error("Failed to update session title:", e);
      }
    },
    [queryClient],
  );

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

    try {
      const budgetRes = await fetch("/api/tokens/budget");
      if (budgetRes.ok) {
        const budgetData = await budgetRes.json();
        if (!budgetData.allowed) {
          showUpgrade("token_limit");
          return;
        }
      }
    } catch {}

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: message,
      role: "user",
      timestamp: new Date(),
      attachments: uploadedFiles.length > 0 ? [...uploadedFiles] : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setUploadedFiles([]);
    const justExtractedContext = await processPendingAttachmentsOnSend();

    const isFirstMessage =
      messages.length <= 1 && messages[0]?.id === "welcome";
    if (isFirstMessage && sessionId) {
      generateSessionTitle(message, sessionId);
    }

    setIsTyping(true);
    setBrainContextCount(0);
    if (appMode === "build") {
      buildChatMutation.mutate(
        justExtractedContext
          ? `${message}\n\nContext from uploaded files:\n${justExtractedContext}`
          : message,
      );
      return;
    }

    // Combine user input with file context and conversation context if available
    let combinedMessage = message;
    const effectiveFileContext = justExtractedContext || fileContext;
    if (effectiveFileContext) {
      const isGenerateFromFiles =
        message.toLowerCase().includes("generate plan") ||
        message.toLowerCase().includes("create plan from");

      if (isGenerateFromFiles) {
        combinedMessage = `Based on the following file content, create a comprehensive project plan:\n\n${effectiveFileContext}`;
      } else {
        combinedMessage = `User Request: ${message}\n\nContext from uploaded files:\n${effectiveFileContext}\n\nPlease create a project plan that incorporates both the user's request and the file content.`;
      }

      setFileContext(null);
    }

    const convContext = getConversationContextText(
      allConversations,
      selectedConversationIds,
    );
    if (convContext) {
      combinedMessage = `${combinedMessage}\n\nContext from meetings/conversations:\n${convContext}`;
    }

    if (selectedEvidenceIds.length > 0) {
      const EV_CAP = 30000;
      const EV_TOTAL = 90000;
      let evUsed = 0;
      const evParts: string[] = [];
      for (const e of allEvidenceItems.filter((e) =>
        selectedEvidenceIds.includes(e.id),
      )) {
        const rem = EV_TOTAL - evUsed;
        if (rem <= 200) break;
        const cap = Math.min(EV_CAP, rem);
        let body = e.content;
        if (body.length > cap) {
          const headSize = Math.floor(cap * 0.8);
          const tailSize = cap - headSize - 50;
          const omitted = body.length - headSize - Math.max(tailSize, 0);
          body =
            body.slice(0, headSize) +
            `\n…[${omitted.toLocaleString()} chars trimmed]…\n` +
            (tailSize > 0 ? body.slice(-tailSize) : "");
        }
        const entry = `[Evidence: ${e.title}] (source: ${e.source})\n${body}`;
        evParts.push(entry);
        evUsed += entry.length;
      }
      const evidenceContext = evParts.join("\n\n---\n\n");
      if (evidenceContext) {
        combinedMessage = `${combinedMessage}\n\nContext from Evidence Library:\n${evidenceContext}`;
      }
    }

    const isUpdate = currentPlan !== null;
    generateProjectPlan.mutate({
      message: combinedMessage,
      isUpdate,
      currentPlan,
    });
  };

  const handleSaveProject = async (projectData: ProjectPlan) => {
    // Show custom dialog instead of browser prompt
    setProjectToSave(projectData);
    setProjectNameInput(projectData.name || "");
    setShowSaveDialog(true);
  };

  const handleConfirmSave = async () => {
    if (!projectToSave || !projectNameInput.trim()) return;

    setShowSaveDialog(false);

    try {
      const projectPayload = {
        plan: {
          name: projectNameInput.trim(),
          description: projectToSave.description,
          timeline: {
            startDate: projectToSave.startDate,
            endDate: projectToSave.endDate,
          },
          tasks: [] as any[],
          milestones: projectToSave.milestones,
          tags: ["AI_Plan"],
        },
      };

      const response = await fetch("/api/projects/from-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(projectPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(JSON.stringify(errorData));
      }

      const data = await response.json();
      console.log("Project creation response:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });

      toast({
        title: "Project created!",
        description: `${projectNameInput.trim()} has been saved successfully. Starting a new chat session...`,
      });

      startNewChat();
      if (data && data.project && data.project.id) {
        console.log("Navigating to project:", data.project.id);
        setTimeout(() => {
          setLocation(`/project/${data.project.id}`);
        }, 5000); // Small delay to ensure toast is shown
      } else {
        console.log("No project ID found in response:", data);
      }

      // Reset dialog state
      setProjectToSave(null);
      setProjectNameInput("");
    } catch (error) {
      // Reset dialog state on error too
      setProjectToSave(null);
      setProjectNameInput("");
      console.error("Error saving project:", error);
      let errorMessage = "Failed to save project. Please try again.";
      let errorTitle = "Error";

      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes("403") || errMsg.includes("limit")) {
        showUpgrade("project_limit");
        return;
      }

      if (error instanceof Error && error.message) {
        try {
          const errorData = JSON.parse(error.message);
          if (errorData.details) errorMessage = errorData.details;
          else if (errorData.message) errorMessage = errorData.message;
        } catch {
          errorMessage = error.message;
        }
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const removeFile = (fileId: string) => {
    pendingFilesRef.current.delete(fileId);
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // Sidebar nav data (unchanged)
  const navigationSections = [
    {
      title: "Planning",
      items: [
        {
          id: "chat",
          icon: MessageSquare,
          label: "AI Chat",
          description: "Project planning assistant",
          badge: "Active",
        },
        {
          id: "templates",
          icon: Bookmark,
          label: "Templates",
          description: "Quick start templates",
          count: 4,
        },
      ],
    },
    {
      title: "Management",
      items: [
        {
          id: "history",
          icon: History,
          label: "History",
          description: "Previous conversations",
          count: chatSessions?.length || 0,
        },
        {
          id: "saved",
          icon: Archive,
          label: "Saved Plans",
          description: "Draft project plans",
        },
      ],
    },
    {
      title: "Insights",
      items: [
        {
          id: "analytics",
          icon: BarChart3,
          label: "Analytics",
          description: "Usage insights",
        },
        {
          id: "settings",
          icon: Settings,
          label: "Settings",
          description: "Preferences",
        },
      ],
    },
  ];

  const renderActiveView = () => {
    switch (activeView) {
      case "history":
        return (
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Chat History</h3>
            {sessionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading sessions...</span>
              </div>
            ) : chatSessions && chatSessions.length > 0 ? (
              <div className="space-y-2">
                {(chatSessions as any[]).map((session: any) => (
                  <div
                    key={session.sessionId}
                    className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      loadChatHistory(session.sessionId);
                      setActiveView("chat");
                    }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-sm flex items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            session.mode === "build"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-purple-100 text-purple-700"
                          }`}
                        >
                          {session.mode === "build" ? "Build" : "Plan"}
                        </span>
                        {session.title && session.title !== "New Conversation"
                          ? session.title
                          : `Session ${session.sessionId?.slice?.(0, 8) || ""}`}
                      </span>
                      <span className="text-xs text-gray-500">
                        {safeFormatDate(
                          session.updatedAt || session.createdAt,
                          "MMM d, h:mm a",
                          "No date",
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {session.last_message || "No messages yet"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                No chat history yet
              </p>
            )}
          </div>
        );
      case "templates":
        return (
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Project Templates</h3>
            <div className="grid gap-4">
              {[
                {
                  name: "Product Launch",
                  icon: Rocket,
                  description: "Complete product launch project",
                },
                {
                  name: "Marketing Campaign",
                  icon: Target,
                  description: "90-day marketing campaign",
                },
                {
                  name: "Website Redesign",
                  icon: Brain,
                  description: "Website redesign project",
                },
                {
                  name: "Team Onboarding",
                  icon: Users,
                  description: "Employee onboarding process",
                },
              ].map((template, idx) => (
                <Card
                  key={idx}
                  className="p-4 hover:shadow-md cursor-pointer"
                  onClick={() => {
                    setInput(
                      `Plan a ${template.name.toLowerCase()} project with detailed milestones and tasks`,
                    );
                    setActiveView("chat");
                  }}
                >
                  <div className="flex items-center gap-3">
                    <template.icon className="h-8 w-8 text-purple-600" />
                    <div>
                      <h4 className="font-medium">{template.name}</h4>
                      <p className="text-sm text-gray-600">
                        {template.description}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      case "analytics":
        return (
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Usage Analytics</h3>
            <div className="grid gap-4">
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Total Projects Created
                  </span>
                  <span className="text-2xl font-bold text-purple-600">
                    {chatSessions?.length || 0}
                  </span>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">AI Conversations</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {chatSessions?.length || 0}
                  </span>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Files Processed</span>
                  <span className="text-2xl font-bold text-green-600">-</span>
                </div>
              </Card>
            </div>
          </div>
        );
      case "saved":
        return (
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Saved Project Plans</h3>
            <div className="space-y-3">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">E-commerce Platform Launch</h4>
                  <Badge variant="secondary">Draft</Badge>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  6 milestones, 24 tasks
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline">
                    Load
                  </Button>
                  <Button size="sm" variant="ghost">
                    Delete
                  </Button>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Marketing Campaign Q1</h4>
                  <Badge variant="secondary">Draft</Badge>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  4 milestones, 18 tasks
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline">
                    Load
                  </Button>
                  <Button size="sm" variant="ghost">
                    Delete
                  </Button>
                </div>
              </Card>
              <div className="text-center py-8 text-gray-500">
                <Archive className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">No more saved plans</p>
              </div>
            </div>
          </div>
        );
      case "settings":
        return (
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Agent Settings</h3>
            <div className="space-y-4">
              <Card className="p-4">
                <h4 className="font-medium mb-2">AI Response Style</h4>
                <p className="text-sm text-gray-600 mb-3">
                  How detailed should the AI responses be?
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="style" defaultChecked />
                    <span className="text-sm">Detailed (Recommended)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="style" />
                    <span className="text-sm">Concise</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="style" />
                    <span className="text-sm">Expert</span>
                  </label>
                </div>
              </Card>
              <Card className="p-4">
                <h4 className="font-medium mb-2">Auto-save Projects</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Automatically save generated project plans
                </p>
                <label className="flex items-center gap-2">
                  <input type="checkbox" />
                  <span className="text-sm">Enable auto-save</span>
                </label>
              </Card>
              <Card className="p-4">
                <h4 className="font-medium mb-2">
                  Enterprise Document Processing
                </h4>
                <p className="text-sm text-gray-600 mb-3">
                  AI-powered analysis of large client requirement documents
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">File size limit:</span>
                    <span className="font-medium text-purple-600">100MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Supported formats:</span>
                    <span className="font-medium">15+ types</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Processing model:</span>
                    <span className="font-medium">GPT-4o</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-500 bg-purple-50 p-2 rounded">
                  🎯 Optimized for RFPs, technical specs, compliance docs, and
                  multi-stakeholder requirements
                </div>
              </Card>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row items-stretch gap-6 max-w-full overflow-hidden">
      {isWindowDragging && (
        <div
          className="fixed inset-0 z-50 bg-emerald-500/5"
          onDragOver={(e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={handleWindowDrop}
          data-testid="window-drop-overlay"
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 lg:left-0 lg:right-1/2 lg:px-8">
            <div className="bg-white border-2 border-dashed border-emerald-400 shadow-xl rounded-2xl px-8 py-6 text-center max-w-md">
              <Upload className="h-8 w-8 text-emerald-600 mx-auto mb-3" />
              <p className="text-base font-semibold text-emerald-800">
                Drop anywhere to attach to chat
              </p>
              <p className="text-sm text-emerald-600 mt-1">
                Images, PDFs, Office docs, transcripts — up to 100MB each
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Chat Interface */}
      <Card
        {...getRootProps({
          className:
            "flex-1 flex flex-col min-w-0 lg:w-1/2 min-h-0 overflow-hidden relative",
          onClick: undefined,
        })}
      >
        {isDragActive && (
          <div className="absolute inset-0 z-30 bg-emerald-500/10 border-2 border-dashed border-emerald-400 rounded-xl flex items-center justify-center pointer-events-none">
            <div className="bg-white/95 border border-emerald-200 shadow-lg rounded-xl px-6 py-4 text-center max-w-sm mx-4">
              <Upload className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-emerald-800">
                Drop files to attach
              </p>
              <p className="text-xs text-emerald-600 mt-1">
                Images, PDFs, Office docs, transcripts (.srt) — up to 100MB each
              </p>
            </div>
          </div>
        )}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Brain
                className={`h-6 w-6 ${appMode === "build" ? "text-orange-500" : "text-purple-600"}`}
              />
              <h2 className="text-xl font-semibold">
                {appMode === "build"
                  ? "Product Discovery"
                  : "AI Project Planner"}
              </h2>
              <Badge variant="secondary">
                {sessionId ? "Session Active" : "New Session"}
              </Badge>
              {sessionId && (
                <Badge
                  variant="outline"
                  className="text-green-600 border-green-600"
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Persistent
                </Badge>
              )}
              {currentPlan && (
                <Badge
                  variant="outline"
                  className="text-green-600 border-green-200 bg-green-50"
                >
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                  Plan Loaded
                </Badge>
              )}
            </div>

            {/* New Chat + Chat History */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={startNewChat}
              >
                <Plus className="h-4 w-4" />
                New Chat
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <History className="h-4 w-4" />
                    History
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Recent Conversations</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {sessionsLoading ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                      Loading sessions...
                    </div>
                  ) : sessionsError ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      Unable to load history
                    </div>
                  ) : chatSessions && chatSessions.length > 0 ? (
                    (chatSessions as any[]).slice(0, 5).map((session: any) => (
                      <DropdownMenuItem
                        key={session.sessionId}
                        onClick={() => loadChatHistory(session.sessionId)}
                        className="cursor-pointer"
                        disabled={loadingHistory}
                      >
                        <History className="h-4 w-4 mr-2" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate flex items-center gap-1.5">
                            <span
                              className={`text-[9px] font-semibold px-1 py-0.5 rounded shrink-0 ${
                                session.mode === "build"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-purple-100 text-purple-700"
                              }`}
                            >
                              {session.mode === "build" ? "Build" : "Plan"}
                            </span>
                            <span className="truncate">
                              {session.title &&
                              session.title !== "New Conversation"
                                ? session.title
                                : `Session ${session.sessionId?.slice?.(0, 8) || ""}`}
                            </span>
                          </p>
                          <p className="text-xs text-gray-500">
                            {safeFormatDate(
                              session.updatedAt || session.createdAt,
                              "MMM d, h:mm a",
                              "No date",
                            )}
                          </p>
                        </div>
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-gray-500">
                      No previous conversations
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {appMode === "build"
              ? "Analyze usage & feedback to discover what to build next"
              : "Enterprise-grade document analysis for client requirements up to 100MB"}
          </p>

          {/* Context Status Bar */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge
              variant="outline"
              className={
                appMode === "build"
                  ? "bg-purple-50 text-purple-700 border-purple-200"
                  : "bg-blue-50 text-blue-700 border-blue-200"
              }
            >
              {appMode === "build" ? (
                <>
                  <Rocket className="h-3 w-3 mr-1" /> Build Mode
                </>
              ) : (
                <>
                  <Target className="h-3 w-3 mr-1" /> Plan Mode
                </>
              )}
            </Badge>
            {selectedConversationIds.length > 0 && (
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-200"
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                {selectedConversationIds.length} meeting
                {selectedConversationIds.length !== 1 ? "s" : ""}
              </Badge>
            )}
            {selectedEvidenceIds.length > 0 && (
              <Badge
                variant="outline"
                className="bg-violet-50 text-violet-700 border-violet-200"
              >
                <Library className="h-3 w-3 mr-1" />
                {selectedEvidenceIds.length} evidence
              </Badge>
            )}
            {uploadedFiles.length > 0 && (
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200"
              >
                <FileText className="h-3 w-3 mr-1" />
                {uploadedFiles.length} file
                {uploadedFiles.length !== 1 ? "s" : ""}
              </Badge>
            )}
            {currentPlan && (
              <Badge
                variant="outline"
                className="bg-green-50 text-green-700 border-green-200"
              >
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1" />
                Plan Active
              </Badge>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 p-6 bg-gradient-to-b from-gray-50/50 to-white">
          <div className="space-y-5 max-w-3xl mx-auto">
            {messages.map((message, messageIndex) => {
              const isUser = message.role === "user";
              const isAssistant = message.role === "assistant";
              const isWelcome = message.id === "welcome";
              const isLastMessage = messageIndex === messages.length - 1;

              if (
                isAssistant &&
                !isWelcome &&
                (!message.content || message.content.trim() === "") &&
                !message.clarifications?.length &&
                !message.buildFeatures?.length &&
                !message.projectPlan
              ) {
                return null;
              }
              const cleanContent = isAssistant
                ? message.content
                    .replace(/```json[\s\S]*?```/g, "")
                    .replace(/^\s*\n/gm, "")
                    .trim() || message.content
                : message.content;

              const showPills =
                isAssistant &&
                isLastMessage &&
                !input.trim() &&
                !generateProjectPlan.isPending &&
                !buildChatMutation.isPending;

              return (
                <div key={message.id}>
                  <div
                    className={`flex ${isUser ? "justify-end" : "justify-start"} animate-in fade-in-0 slide-in-from-bottom-2 duration-300`}
                  >
                    {isAssistant && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center mr-2.5 mt-1 ring-1 ring-emerald-200/60">
                        <Bot className="h-4 w-4 text-emerald-700" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] ${
                        isUser
                          ? "bg-gray-900 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm"
                          : "bg-white border border-gray-200 shadow-sm px-5 py-4 rounded-2xl rounded-tl-sm"
                      }`}
                    >
                      {isUser ? (
                        <div className="text-sm whitespace-pre-wrap">
                          {cleanContent}
                        </div>
                      ) : (
                        <div className="text-sm prose prose-sm prose-gray max-w-none [&>h2]:text-base [&>h2]:font-semibold [&>h2]:mt-3 [&>h2]:mb-2 [&>h2]:text-gray-900 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mt-2 [&>h3]:mb-1 [&>h3]:text-gray-800 [&>p]:text-sm [&>p]:text-gray-700 [&>p]:mb-2 [&>p]:leading-relaxed [&>ul]:text-sm [&>ul]:text-gray-700 [&>ul]:mb-2 [&>ul]:space-y-1 [&>ol]:text-sm [&>ol]:text-gray-700 [&>ol]:mb-2 [&_strong]:text-gray-900 [&>hr]:my-3">
                          {(message.citations?.length || 0) > 0 ? (
                            <>
                              <RenderWithCitations
                                text={cleanContent}
                                citations={message.citations || []}
                                surface="planner"
                                sessionId={sessionId}
                              />
                              <SourcesFooter
                                citations={message.citations || []}
                                surface="planner"
                                sessionId={sessionId}
                              />
                            </>
                          ) : (
                            <RenderWithCitations
                              text={cleanContent}
                              citations={[]}
                              surface="planner"
                              sessionId={sessionId}
                            />
                          )}
                        </div>
                      )}

                      {message.attachments &&
                        message.attachments.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                            {message.attachments.map((file) => (
                              <div
                                key={file.id}
                                className="flex items-center gap-2 text-xs opacity-60"
                              >
                                <FileText className="h-3 w-3" />
                                <span>{file.name}</span>
                                <span>({(file.size / 1024).toFixed(1)}KB)</span>
                              </div>
                            ))}
                          </div>
                        )}

                      {message.clarifications &&
                        message.clarifications.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-medium">
                              To create a better plan, could you tell me:
                            </p>
                            {message.clarifications.map(
                              (clarification, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2"
                                >
                                  <span className="text-xs">•</span>
                                  <span className="text-xs">
                                    {clarification}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                        )}
                      {isAssistant &&
                        message.projectPlan &&
                        (() => {
                          const isActive =
                            currentPlan?.name === message.projectPlan.name &&
                            JSON.stringify(currentPlan?.milestones) ===
                              JSON.stringify(message.projectPlan.milestones);
                          return (
                            <button
                              type="button"
                              onClick={() =>
                                setCurrentPlan(message.projectPlan!)
                              }
                              className={`mt-3 w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                                isActive
                                  ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200"
                                  : "border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300"
                              }`}
                              data-testid={`button-view-plan-${message.id}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                                    <span className="text-xs font-semibold text-gray-900 truncate">
                                      {message.projectPlan.name ||
                                        "Untitled project"}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-gray-500 mt-0.5">
                                    {message.projectPlan.milestones?.length ||
                                      0}{" "}
                                    milestones
                                    {isActive ? " · viewing on the right" : ""}
                                  </p>
                                </div>
                                {!isActive && (
                                  <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-0.5 flex-shrink-0">
                                    View
                                    <ArrowRight className="h-3 w-3" />
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })()}
                      {message.buildFeatures &&
                        message.buildFeatures.length > 0 &&
                        isLastMessage &&
                        !generateProjectPlan.isPending &&
                        !buildChatMutation.isPending && (
                          <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Rocket className="h-4 w-4 text-indigo-600" />
                              <span className="text-xs font-semibold text-indigo-800">
                                What's next?
                              </span>
                            </div>
                            <p className="text-xs text-indigo-700 leading-relaxed">
                              Review the {message.buildFeatures.length} feature
                              {message.buildFeatures.length !== 1 ? "s" : ""} in
                              the right panel. You can <strong>refine</strong>{" "}
                              specs, <strong>approve</strong> to create a
                              project, or{" "}
                              <strong>send directly to a coding agent</strong>.
                            </p>
                          </div>
                        )}

                      {message.id.startsWith("approved-") &&
                        (() => {
                          const parts = message.id.split("-");
                          const msgProjectId =
                            parts.length >= 3
                              ? parseInt(parts[parts.length - 1])
                              : null;
                          const targetProjectId =
                            msgProjectId &&
                            !isNaN(msgProjectId) &&
                            msgProjectId > 0
                              ? msgProjectId
                              : recentlyApprovedProjectId;
                          if (!targetProjectId) return null;
                          return (
                            <div className="mt-3">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() =>
                                  setLocation(
                                    `/project/${targetProjectId}?openChat=1`,
                                  )
                                }
                              >
                                <ArrowRight className="h-3 w-3 mr-1" />
                                Open Project
                              </Button>
                            </div>
                          );
                        })()}

                      {message.buildFeatures &&
                        message.buildFeatures.length > 0 && (
                          <div className="mt-4 space-y-3 border-t border-gray-100 pt-3">
                            {message.buildFeatures.map((feature, fIdx) => {
                              const hasInsights =
                                feature.insights && feature.insights.length > 0;
                              const hasReasoning = !!feature.reasoning_chain;
                              if (!hasInsights && !hasReasoning) return null;
                              const toggleKey = `${message.id}-${fIdx}`;
                              const isExpanded =
                                expandedInsights[toggleKey] || false;
                              return (
                                <div
                                  key={fIdx}
                                  className="rounded-lg border border-amber-200 bg-amber-50/50 overflow-hidden"
                                >
                                  <button
                                    onClick={() =>
                                      setExpandedInsights((prev) => ({
                                        ...prev,
                                        [toggleKey]: !isExpanded,
                                      }))
                                    }
                                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-amber-100/50 transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Search className="h-3.5 w-3.5 text-amber-600" />
                                      <span className="text-xs font-medium text-amber-800">
                                        Why this recommendation? —{" "}
                                        {feature.feature_title}
                                      </span>
                                    </div>
                                    {isExpanded ? (
                                      <ChevronUp className="h-3.5 w-3.5 text-amber-600" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5 text-amber-600" />
                                    )}
                                  </button>
                                  {isExpanded && (
                                    <div className="px-3 pb-3 space-y-3">
                                      {hasInsights &&
                                        feature.insights!.map(
                                          (insight, iIdx) => (
                                            <div
                                              key={iIdx}
                                              className="rounded-md bg-white border border-amber-100 p-3 space-y-2"
                                            >
                                              <div className="flex items-center gap-1.5">
                                                <Lightbulb className="h-3 w-3 text-amber-500" />
                                                <span className="text-xs font-semibold text-gray-800">
                                                  {insight.theme}
                                                </span>
                                              </div>
                                              <div className="text-xs text-gray-700">
                                                <span className="font-medium text-gray-900">
                                                  Root cause:{" "}
                                                </span>
                                                {insight.root_cause}
                                              </div>
                                              {insight.supporting_quotes &&
                                                insight.supporting_quotes
                                                  .length > 0 && (
                                                  <div className="space-y-1.5 pl-2 border-l-2 border-amber-200">
                                                    {insight.supporting_quotes.map(
                                                      (q, qIdx) => (
                                                        <div
                                                          key={qIdx}
                                                          className="flex items-start gap-1.5"
                                                        >
                                                          <Quote className="h-3 w-3 text-amber-400 flex-shrink-0 mt-0.5" />
                                                          <span className="text-xs text-gray-600 italic">
                                                            "{q}"
                                                          </span>
                                                        </div>
                                                      ),
                                                    )}
                                                  </div>
                                                )}
                                            </div>
                                          ),
                                        )}
                                      {hasReasoning && (
                                        <div className="rounded-md bg-white border border-amber-100 p-3">
                                          <div className="flex items-center gap-1.5 mb-1.5">
                                            <Target className="h-3 w-3 text-amber-500" />
                                            <span className="text-xs font-semibold text-gray-800">
                                              Reasoning Chain
                                            </span>
                                          </div>
                                          <p className="text-xs text-gray-700 leading-relaxed">
                                            {feature.reasoning_chain}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                      <div
                        className={`text-xs mt-2 ${isUser ? "opacity-40" : "text-gray-400"}`}
                      >
                        {safeFormatDate(message.timestamp, "h:mm a", "")}
                      </div>
                      {/* Task #92: thumbs feedback under assistant messages only.
                          Walk backwards to find the user prompt that produced
                          this answer so the telemetry row carries the query. */}
                      {isAssistant && !isWelcome && cleanContent && (() => {
                        let priorUserQuery: string | undefined;
                        for (let i = messageIndex - 1; i >= 0; i--) {
                          if (messages[i].role === "user" && messages[i].content?.trim()) {
                            priorUserQuery = messages[i].content;
                            break;
                          }
                        }
                        return (
                          <>
                            <MessageFeedback
                              surface="planner"
                              responseText={cleanContent}
                              query={priorUserQuery}
                              sessionId={sessionId}
                              modelUsed={appMode === "build" ? "build" : "plan"}
                              retrievedChunkIds={message.retrievedChunkIds || []}
                              citationsEmitted={message.citationsEmitted || 0}
                              citationsStripped={message.citationsStripped || 0}
                              qualityFormat={
                                message.quality?.scores?.format ?? null
                              }
                              qualitySpecificity={
                                message.quality?.scores?.specificity ?? null
                              }
                              qualityCompleteness={
                                message.quality?.scores?.completeness ?? null
                              }
                              qualityReasons={
                                message.quality?.scores
                                  ? {
                                      format:
                                        message.quality.scores.formatReason,
                                      specificity:
                                        message.quality.scores
                                          .specificityReason,
                                      completeness:
                                        message.quality.scores
                                          .completenessReason,
                                    }
                                  : null
                              }
                            />
                            <QualityHint
                              quality={message.quality}
                              disabled={isTyping}
                              onImprove={() =>
                                handleSendMessage(
                                  buildImprovePrompt(
                                    priorUserQuery,
                                    message.quality,
                                  ),
                                )
                              }
                            />
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {showPills && (
                    <div
                      className={`mt-3 ${isWelcome ? "ml-9" : "ml-9"}`}
                      data-tour="prompt-pills"
                    >
                      <PromptPills
                        mode={appMode}
                        onSelect={(text) => {
                          setInput(text);
                        }}
                        isVisible={showPills}
                        variant={isWelcome ? "welcome" : "inline"}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {(() => {
              const isPending =
                generateProjectPlan.isPending || buildChatMutation.isPending;
              if (!isPending) return null;
              // Hide the indicator once the streaming bubble has actual content,
              // so we never show two "agent" boxes at once.
              const streamingMsg = streamingMessageId
                ? messages.find((m) => m.id === streamingMessageId)
                : null;
              const hasStreamedContent =
                !!streamingMsg && !!streamingMsg.content?.trim();
              if (hasStreamedContent) return null;
              return (
                <div className="flex justify-start animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center mr-2.5 mt-1 ring-1 ring-emerald-200/60">
                    <Bot className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div className="bg-white border border-gray-200 shadow-sm rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex gap-1">
                        <span
                          className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                      <span className="text-sm text-gray-500 font-medium">
                        Thinking
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input & attachments */}
        <div className="p-4 border-t">
          <div className="space-y-0">
            <input {...getInputProps()} style={{ display: "none" }} />

            {/* Conversation & Evidence context selectors */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <ConversationSelector
                selectedIds={selectedConversationIds}
                onSelectionChange={setSelectedConversationIds}
              />

              {allEvidenceItems.length > 0 && (
                <Popover
                  open={showEvidencePicker}
                  onOpenChange={setShowEvidencePicker}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`gap-1.5 text-xs h-8 ${selectedEvidenceIds.length > 0 ? "border-violet-300 bg-violet-50 text-violet-700" : ""}`}
                      data-testid="button-evidence-picker"
                    >
                      <Library className="h-3.5 w-3.5" />
                      Evidence
                      {selectedEvidenceIds.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-violet-200 text-violet-800"
                        >
                          {selectedEvidenceIds.length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="start"
                    sideOffset={6}
                    collisionPadding={12}
                    className="w-80 p-0 overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">
                        Attach evidence as context
                      </span>
                      {selectedEvidenceIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedEvidenceIds([])}
                          className="text-[11px] text-slate-400 hover:text-slate-600"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <ScrollArea className="max-h-72">
                      <div className="p-1.5 space-y-1">
                        {allEvidenceItems.map((item) => {
                          const isSelected = selectedEvidenceIds.includes(
                            item.id,
                          );
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                setSelectedEvidenceIds((prev) =>
                                  isSelected
                                    ? prev.filter((id) => id !== item.id)
                                    : [...prev, item.id],
                                );
                              }}
                              className={`w-full flex items-start gap-2 p-2 rounded-md text-left transition-colors text-xs ${
                                isSelected
                                  ? "bg-violet-50 border border-violet-200"
                                  : "hover:bg-slate-50 border border-transparent"
                              }`}
                            >
                              <div
                                className={`mt-0.5 h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center ${
                                  isSelected
                                    ? "bg-violet-600 border-violet-600 text-white"
                                    : "border-slate-300"
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-700 truncate">
                                  {item.title}
                                </p>
                                <p className="text-slate-400 truncate mt-0.5">
                                  {item.content.slice(0, 60)}...
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Attached conversations indicator */}
            {selectedConversationIds.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700">
                  {selectedConversationIds.length} meeting
                  {selectedConversationIds.length !== 1 ? "s" : ""} attached
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedConversationIds([])}
                  className="ml-auto p-0.5 rounded hover:bg-emerald-100 transition-colors"
                  title="Remove all attached meetings"
                >
                  <X className="h-3 w-3 text-emerald-500" />
                </button>
              </div>
            )}

            {/* Attached evidence indicator */}
            {selectedEvidenceIds.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-violet-50 border border-violet-200 rounded-lg">
                <Library className="h-3.5 w-3.5 text-violet-600" />
                <span className="text-xs font-medium text-violet-700">
                  {selectedEvidenceIds.length} evidence item
                  {selectedEvidenceIds.length !== 1 ? "s" : ""} attached
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedEvidenceIds([])}
                  className="ml-auto p-0.5 rounded hover:bg-violet-100 transition-colors"
                  title="Remove all attached evidence"
                >
                  <X className="h-3 w-3 text-violet-500" />
                </button>
              </div>
            )}

            {/* Textarea */}
            <div className="border border-gray-200 rounded-xl overflow-hidden focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-200">
              {attachmentError && (
                <div
                  role="alert"
                  className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  <X className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span className="flex-1">{attachmentError}</span>
                  <button
                    type="button"
                    onClick={() => setAttachmentError(null)}
                    className="text-red-700 hover:text-red-900"
                    aria-label="Dismiss error"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3 pt-3">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="inline-flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 max-w-[280px] group"
                    >
                      <FileText className="h-3 w-3 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{file.name}</span>
                      {file.parser?.parserUsed === "unstructured" && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0"
                          title={file.parser.note || "Parsed with Unstructured"}
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          Unstructured
                          {typeof file.parser.pageCount === "number" &&
                          file.parser.pageCount > 0
                            ? ` · ${file.parser.pageCount}p`
                            : ""}
                          {typeof file.parser.tableCount === "number" &&
                          file.parser.tableCount > 0
                            ? ` · ${file.parser.tableCount} tbl`
                            : ""}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(file.id)}
                        className="flex-shrink-0 ml-0.5 p-0.5 rounded hover:bg-gray-200 transition-colors"
                      >
                        <X className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div data-tour="chat-input">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(input);
                    }
                  }}
                  placeholder={
                    appMode === "build"
                      ? "Ask about your product..."
                      : "Describe your project idea..."
                  }
                  rows={2}
                  className="border-0 focus-visible:ring-0 shadow-none resize-none px-4 py-3 text-sm"
                  disabled={
                    generateProjectPlan.isPending || buildChatMutation.isPending
                  }
                />
              </div>

              {brainContextCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1 border-t border-teal-100 bg-teal-50/60 text-xs text-teal-700">
                  <Brain className="h-3 w-3" />
                  Using {brainContextCount} context insight
                  {brainContextCount !== 1 ? "s" : ""}
                </div>
              )}

              {/* Toolbar below textarea */}
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-1">
                  {/* Attach button */}
                  <button
                    type="button"
                    onClick={() => open()}
                    disabled={
                      isProcessingFiles ||
                      generateProjectPlan.isPending ||
                      buildChatMutation.isPending
                    }
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50"
                    title="Attach files (100MB max)"
                  >
                    <Upload className="h-4 w-4" />
                  </button>

                  <div className="w-px h-4 bg-gray-200 mx-1" />

                  <button
                    type="button"
                    onClick={() => setUseContextBrain((v) => !v)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-sm transition-colors ${
                      useContextBrain
                        ? "bg-teal-100 text-teal-700 hover:bg-teal-200"
                        : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    }`}
                    title={
                      useContextBrain
                        ? "Context Brain: ON — click to disable"
                        : "Context Brain: OFF — click to enable"
                    }
                  >
                    <Brain className="h-4 w-4" />
                    {!useContextBrain && <span className="text-xs">Off</span>}
                  </button>

                  <div className="w-px h-4 bg-gray-200 mx-1" />

                  {/* Refine prompt button */}
                  <button
                    type="button"
                    onClick={() => setShowPromptRefiner(true)}
                    disabled={
                      generateProjectPlan.isPending ||
                      buildChatMutation.isPending
                    }
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50"
                    title="Refine your prompt with AI before sending"
                  >
                    <Wand2 className="h-4 w-4" />
                    <span className="text-xs hidden sm:inline">Refine</span>
                  </button>

                  <div className="w-px h-4 bg-gray-200 mx-1" />

                  <div data-tour="mode-toggle">
                    <ModeToggle
                      mode={appMode}
                      onModeChange={(newMode) => {
                        if (newMode === appMode) return;
                        // A deliberate switch must cancel any still-pending
                        // mount auto-restore — otherwise a late restore (e.g.
                        // when the chat list finishes loading right after the
                        // user clicks Build on first visit) would reload the
                        // last Plan session and snap them back to Plan.
                        hasAutoRestoredRef.current = true;
                        // Switching modes always starts a fresh, correctly-
                        // tagged session so messages/features are never
                        // attached to the other mode's session.
                        setAppMode(newMode);
                        setMessages([getWelcomeMessage(newMode)]);
                        setSessionId(null);
                        setCurrentPlan(null);
                        resetBuildSessionState();
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 hidden sm:inline">
                    Shift + Return for new line
                  </span>
                  <button
                    onClick={() => handleSendMessage(input)}
                    disabled={
                      !input.trim() ||
                      generateProjectPlan.isPending ||
                      buildChatMutation.isPending
                    }
                    className="h-8 w-8 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    {generateProjectPlan.isPending ||
                    buildChatMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <Send className="h-3.5 w-3.5 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center mt-2">
              Requisor can make mistakes. Consider checking important
              information.
            </p>
          </div>
        </div>
      </Card>

      {/* Right Panel - Project Canvas or Feature Candidates */}
      <div
        className="flex-1 min-w-0 flex flex-col lg:w-1/2 min-h-0 overflow-hidden"
        data-tour="canvas-panel"
      >
        {appMode === "build" ? (
          (() => {
            const hasBuildSession =
              buildSessionCandidateIds.length > 0 ||
              showBuildHistory ||
              pendingBuildFeatures.length > 0;
            const baseCandidates = showBuildHistory
              ? (featureCandidates as any[])
              : (featureCandidates as any[]).filter((c: any) =>
                  buildSessionCandidateIds.includes(c.id),
                );
            const filteredCandidates =
              pastDiscoveriesFilter === "all"
                ? baseCandidates
                : baseCandidates.filter(
                    (c: any) => c.projectId === pastDiscoveriesFilter,
                  );
            const sortedAll = [...filteredCandidates].sort((a: any, b: any) => {
              const ar = a.riceScore ?? -1;
              const br = b.riceScore ?? -1;
              if (br !== ar) return br - ar;
              const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return bt - at;
            });
            const VISIBLE_LIMIT = 10;
            const displayCandidates = sortedAll.slice(0, VISIBLE_LIMIT);
            const hiddenCount = Math.max(sortedAll.length - VISIBLE_LIMIT, 0);

            if (!hasBuildSession) {
              return (
                <Card className="h-full flex items-center justify-center min-h-[400px] border-dashed">
                  <CardContent className="text-center p-6">
                    <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                      <Lightbulb className="h-7 w-7 text-slate-300" />
                    </div>
                    <h3 className="text-base font-medium text-slate-500 mb-2">
                      Feature Candidates
                    </h3>
                    <p className="text-sm text-slate-400 max-w-xs mx-auto">
                      Discovered features will appear here as you analyze
                      transcripts and feedback with the AI.
                    </p>
                  </CardContent>
                </Card>
              );
            }

            return (
              <Card className="h-full flex flex-col min-h-[400px]">
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-orange-500" />
                      <h3 className="text-lg font-semibold">
                        {showBuildHistory
                          ? "All Candidates"
                          : "Session Discoveries"}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-xs">
                        {
                          displayCandidates.filter(
                            (c: any) => c.status !== "approved",
                          ).length
                        }{" "}
                        pending
                      </Badge>
                      {displayCandidates.length > 1 && (
                        <Button
                          variant={batchSelectionMode ? "default" : "outline"}
                          size="sm"
                          className={`h-7 text-xs gap-1.5 ${batchSelectionMode ? "bg-indigo-500 hover:bg-indigo-600 text-white" : "text-indigo-600 border-indigo-200 hover:bg-indigo-50"}`}
                          onClick={() => {
                            setBatchSelectionMode(!batchSelectionMode);
                            if (batchSelectionMode) setSelectedCandidateIds([]);
                          }}
                        >
                          <Code2 className="h-3 w-3" />
                          {batchSelectionMode ? "Cancel" : "Batch Send"}
                        </Button>
                      )}
                      {displayCandidates.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                          onClick={() => setShowExportReport(true)}
                        >
                          <FileText className="h-3 w-3" />
                          Export
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-slate-400">
                      {showBuildHistory
                        ? "Showing all past discoveries"
                        : "Features found this session"}
                      {pastDiscoveriesFilter !== "all" && (
                        <span className="ml-1 text-indigo-500">
                          · filtered by selected project
                        </span>
                      )}
                    </p>
                    {showBuildHistory ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-slate-400 hover:text-slate-600"
                        onClick={() => setShowBuildHistory(false)}
                      >
                        <X className="h-3 w-3 mr-0.5" />
                        Close
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-slate-400 hover:text-slate-600"
                        onClick={() => setShowBuildHistory(true)}
                      >
                        <History className="h-3 w-3 mr-0.5" />
                        History
                      </Button>
                    )}
                  </div>
                </div>
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-4 space-y-3">
                    {displayCandidates.length > 0 && (
                      <PriorityMatrix candidates={displayCandidates} />
                    )}
                    {pendingBuildFeatures.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-amber-700">
                            {pendingBuildFeatures.length} unsaved
                            {pendingBuildFeatures.length === 1
                              ? " feature"
                              : " features"}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                            disabled={retryingPending}
                            onClick={() => {
                              const gen =
                                pendingBuildFeaturesGenerationRef.current;
                              if (
                                gen === null ||
                                gen !== buildSaveGenerationRef.current
                              ) {
                                console.warn(
                                  "[Build Mode] Ignoring stale retry from a previous chat session.",
                                );
                                return;
                              }
                              setRetryingPending(true);
                              saveBuildFeatures(
                                pendingBuildFeatures,
                                gen,
                              ).finally(() => setRetryingPending(false));
                            }}
                          >
                            {retryingPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ArrowRight className="h-3 w-3" />
                            )}
                            Retry save
                          </Button>
                        </div>
                        {pendingBuildFeatures.map((feature, idx) => (
                          <Card
                            key={`pending-${idx}`}
                            className="border-amber-200 bg-amber-50/40"
                          >
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <h4 className="text-sm font-semibold text-slate-800 leading-snug">
                                  {feature.feature_title || "Untitled feature"}
                                </h4>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-amber-300 text-amber-700 bg-white shrink-0"
                                >
                                  Unsaved
                                </Badge>
                              </div>
                              {feature.why_now && (
                                <p className="text-xs text-slate-600 line-clamp-3">
                                  {feature.why_now}
                                </p>
                              )}
                              <p className="text-[11px] text-amber-700 mt-2">
                                Couldn't save to your library yet — Approve is
                                disabled until this is saved.
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                    {displayCandidates.length === 0 &&
                    pendingBuildFeatures.length === 0 ? (
                      <div className="text-center py-12">
                        <Lightbulb className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                        <h4 className="text-sm font-medium text-gray-500 mb-1">
                          {showBuildHistory
                            ? "No features discovered yet"
                            : "No features found this session"}
                        </h4>
                        <p className="text-xs text-gray-400 max-w-xs mx-auto">
                          Ask the AI to analyze your product, user feedback, or
                          meeting notes to discover feature opportunities.
                        </p>
                      </div>
                    ) : displayCandidates.length === 0 ? null : (
                      <>
                        {batchSelectionMode &&
                          selectedCandidateIds.length > 0 && (
                            <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg mb-2">
                              <span className="text-sm font-medium text-indigo-700">
                                {selectedCandidateIds.length} feature
                                {selectedCandidateIds.length !== 1
                                  ? "s"
                                  : ""}{" "}
                                selected
                              </span>
                              <Button
                                size="sm"
                                onClick={() => setShowBatchAgentDialog(true)}
                                className="bg-indigo-500 hover:bg-indigo-600 text-white h-7 text-xs"
                              >
                                <Code2 className="h-3 w-3 mr-1" />
                                Send to Agent
                              </Button>
                            </div>
                          )}
                        {displayCandidates.map((candidate: any) => (
                          <FeatureCandidateCard
                            key={candidate.id}
                            candidate={candidate}
                            onApprove={(id, existingProjectId) =>
                              approveFeatureMutation.mutate({
                                id,
                                existingProjectId,
                              })
                            }
                            onDelete={(id) => deleteFeatureMutation.mutate(id)}
                            isApproving={approveFeatureMutation.isPending}
                            projectName={currentPlan?.name || "My Project"}
                            projectDescription={currentPlan?.description}
                            selectable={
                              batchSelectionMode &&
                              candidate.status === "approved"
                            }
                            selected={selectedCandidateIds.includes(
                              candidate.id,
                            )}
                            onSelectionChange={(id, checked) => {
                              setSelectedCandidateIds((prev) =>
                                checked
                                  ? [...prev, id]
                                  : prev.filter((cid) => cid !== id),
                              );
                            }}
                          />
                        ))}
                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setLocation("/past-discoveries")}
                            className="w-full mt-1 py-2.5 px-3 rounded-md border border-dashed border-indigo-200 text-xs font-medium text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 transition-colors flex items-center justify-center gap-1.5"
                            data-testid="button-show-more-discoveries"
                          >
                            <History className="h-3.5 w-3.5" />+{hiddenCount}{" "}
                            more discover{hiddenCount === 1 ? "y" : "ies"} —
                            open Past Discoveries
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </ScrollArea>
                <ExportReport
                  candidates={sortedAll}
                  open={showExportReport}
                  onOpenChange={setShowExportReport}
                />
                {showBatchAgentDialog &&
                  selectedCandidateIds.length > 0 &&
                  (() => {
                    const batchCandidates = sortedAll.filter((c: any) =>
                      selectedCandidateIds.includes(c.id),
                    );
                    if (batchCandidates.length === 0) return null;
                    return (
                      <SendToAgentDialog
                        open={showBatchAgentDialog}
                        onOpenChange={(open) => {
                          setShowBatchAgentDialog(open);
                          if (!open) {
                            setBatchSelectionMode(false);
                            setSelectedCandidateIds([]);
                          }
                        }}
                        candidate={batchCandidates[0]}
                        candidates={batchCandidates}
                        isBatch={true}
                        projectName={currentPlan?.name || "My Project"}
                        projectDescription={currentPlan?.description}
                      />
                    );
                  })()}
              </Card>
            );
          })()
        ) : currentPlan ? (
          <ProjectPlannerCanvasV2
            projectPlan={currentPlan}
            onSave={handleSaveProject}
            onUpdate={setCurrentPlan}
          />
        ) : (
          <Card className="h-full flex items-center justify-center min-h-[400px]">
            <CardContent className="text-center p-6 lg:p-8">
              <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Project Canvas
              </h3>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                Your AI-generated project plan will appear here. Start by
                describing your project or uploading requirement documents.
              </p>
              <div className="mt-4 text-xs text-gray-400">
                Current plan state: {currentPlan ? "Available" : "None"}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Custom Save Project Dialog */}
      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Project</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a name for your project to save it to your projects list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              value={projectNameInput}
              onChange={(e) => setProjectNameInput(e.target.value)}
              placeholder="Project name..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && projectNameInput.trim()) {
                  handleConfirmSave();
                }
              }}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowSaveDialog(false);
                setProjectToSave(null);
                setProjectNameInput("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSave}
              disabled={!projectNameInput.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Save Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {postApprovalCandidate && (
        <SendToAgentDialog
          open={postApprovalAgentDialogOpen}
          onOpenChange={(open) => {
            setPostApprovalAgentDialogOpen(open);
            if (!open) {
              setPostApprovalCandidate(null);
            }
          }}
          candidate={postApprovalCandidate}
          projectName={
            currentPlan?.name ||
            postApprovalCandidate?.featureTitle ||
            "My Project"
          }
          projectDescription={
            currentPlan?.description || postApprovalCandidate?.whyNow
          }
        />
      )}

      <PromptRefinerDialog
        open={showPromptRefiner}
        onOpenChange={setShowPromptRefiner}
        initialDraft={input}
        mode={appMode === "build" ? "build" : "plan"}
        onUsePrompt={(text) => setInput(text)}
      />
    </div>
  );
}
