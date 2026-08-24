import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Sparkles,
  User,
  CheckCircle,
  Loader2,
  Play,
  Plus,
  FolderOpen,
  Clock,
  BarChart3,
  Target,
  Calendar,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessage, ChatAction } from "@shared/ai-types";
import { format } from "date-fns";
import { PromptRefinerDialog } from "@/components/ai-chat/PromptRefinerDialog";
import { MessageFeedback } from "@/components/ai-chat/MessageFeedback";
import {
  QualityHint,
  buildImprovePrompt,
} from "@/components/ai-chat/QualityHint";
import {
  RenderWithCitations,
  SourcesFooter,
  type Citation,
} from "@/components/ai-chat/Citations";

interface DynamicChatProps {
  projectId?: number;
  className?: string;
}

export function DynamicChat({ projectId, className }: DynamicChatProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [clarifications, setClarifications] = useState<any[]>([]);
  const [showRefiner, setShowRefiner] = useState(false);
  type AttachedFile = {
    id: string;
    name: string;
    size: number;
    status: "processing" | "ready" | "error";
    context: string;
  };
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const windowDragCounterRef = useRef(0);

  const processSingleFile = async (file: File, id: string) => {
    const formData = new FormData();
    formData.append("files", file);
    formData.append("userPrompt", input || "");

    try {
      const res = await fetch("/api/ai/process-files", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "File processing failed");
      }
      const data = await res.json();
      const extracted: string =
        (typeof data?.generatedPrompt === "string" && data.generatedPrompt) ||
        (typeof data?.summary === "string" && data.summary) ||
        (typeof data?.message === "string" && data.message) ||
        "";
      setAttachedFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, status: "ready", context: extracted } : f,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Please try again.";
      setAttachedFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "error" } : f)),
      );
      setAttachmentError(`Couldn't read ${file.name}: ${msg}`);
      toast({
        title: "Couldn't read file",
        description: `${file.name}: ${msg}`,
        variant: "destructive",
      });
    }
  };

  const processDroppedFiles = async (files: File[]) => {
    if (!files.length) return;
    setAttachmentError(null);
    const entries: AttachedFile[] = files.map((f) => ({
      id: `${Date.now()}_${f.name}_${Math.random().toString(36).slice(2, 7)}`,
      name: f.name,
      size: f.size,
      status: "processing",
      context: "",
    }));
    setAttachedFiles((prev) => [...prev, ...entries]);
    await Promise.all(entries.map((e, i) => processSingleFile(files[i], e.id)));
  };

  const acceptedFileTypes = {
    "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
    "application/pdf": [".pdf"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      [".docx"],
    "application/vnd.ms-excel": [".xls"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
      ".xlsx",
    ],
    "application/vnd.ms-powerpoint": [".ppt"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      [".pptx"],
    "text/rtf": [".rtf"],
    "application/json": [".json"],
    "text/xml": [".xml"],
    "application/xml": [".xml"],
    "text/plain": [".txt"],
    "text/csv": [".csv"],
    "application/x-subrip": [".srt"],
    "text/srt": [".srt"],
  };
  const maxFileSize = 100 * 1024 * 1024;

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

  const handleRejectedFiles = (rejections: FileRejection[]) => {
    const tooBig = rejections.some((r) =>
      r.errors.some((e) => e.code === "file-too-large"),
    );
    const names = rejections
      .map((r) => r.file?.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");
    const message = tooBig
      ? `${names || "Some files"} are over the 100MB limit.`
      : `Couldn't attach ${names || "those files"}. Supported: images, PDF, Office docs, text/CSV/JSON/XML/RTF, and .srt subtitles.`;
    setAttachmentError(message);
    toast({
      title: tooBig ? "File too large" : "Unsupported file type",
      description: message,
      variant: "destructive",
    });
  };

  const { getRootProps, isDragActive } = useDropzone({
    onDrop: (accepted) => {
      processDroppedFiles(accepted);
    },
    onDropRejected: handleRejectedFiles,
    accept: acceptedFileTypes,
    maxSize: maxFileSize,
    noClick: true,
    noKeyboard: true,
  });

  const removeAttachment = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
    setAttachmentError(null);
  };

  // Window-level drag listener so users get a visible target when dragging
  // files in from outside the browser tab. Drops anywhere on the page route
  // to the chat dropzone.
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
    const files = e.dataTransfer?.files
      ? Array.from(e.dataTransfer.files)
      : [];
    if (!files.length) return;

    const { accepted, rejected } = validateFiles(files);
    if (rejected.length) handleRejectedFiles(rejected);
    if (accepted.length) void processDroppedFiles(accepted);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
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
      void processDroppedFiles(accepted);
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

  const readyAttachmentCount = attachedFiles.filter(
    (f) => f.status === "ready",
  ).length;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Initialize with welcome message
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: `Hi! I'm your Requisor AI assistant. I can help you create and manage projects, analyze your work, and handle tasks through natural conversation.

**What I can do:**
• Create new projects from descriptions
• Add and manage tasks
• Analyze project health and progress
• Optimize timelines and workflows
• Answer questions about your work
• Execute actions based on your requests

**Try saying:**
"Create a new web app project" or "Show me overdue tasks" or "Analyze current project"

What would you like to work on?`,
        timestamp: new Date(),
        projectId
      };
      setMessages([welcomeMessage]);
    }
  }, [messages.length, projectId]);

  // Enhanced AI chat mutation with continuous conversation
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const readyContext = attachedFiles
        .filter((f) => f.status === "ready" && f.context)
        .map((f) => `File: ${f.name}\n${f.context}`)
        .join("\n\n---\n\n");
      const finalMessage = readyContext
        ? `${message}\n\n--- Attached file context ---\n${readyContext}`
        : message;
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: finalMessage, projectId, sessionId })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send message');
      }
      
      return response.json();
    },
    onMutate: () => {
      setIsTyping(true);
    },
    onSuccess: (data) => {
      // Update session ID if provided (for deep intelligence)
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }
      
      // Update clarifications if provided
      if (data.clarifications) {
        setClarifications(data.clarifications);
      }
      
      const assistantMessage: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
        projectId,
        actions: data.actions || [],
        suggestions: data.suggestions || [],
        projectPlan: data.projectCanvas || data.projectPlan,
        retrievedChunkIds: Array.isArray(data.retrievedChunkIds)
          ? data.retrievedChunkIds
          : [],
        citations: Array.isArray(data.citations) ? data.citations : [],
        citationsEmitted: Number.isFinite(data.citationsEmitted)
          ? data.citationsEmitted
          : 0,
        citationsStripped: Number.isFinite(data.citationsStripped)
          ? data.citationsStripped
          : 0,
        // Task #104 — fail-open response quality scores.
        quality: data.quality || undefined,
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
      
      // Refresh data after AI response
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tokens/budget'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tokens/usage'] });
    },
    onError: (error: Error) => {
      setIsTyping(false);
      toast({
        title: "Chat Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Execute action mutation with real-time updates
  const executeActionMutation = useMutation({
    mutationFn: async (action: ChatAction) => {
      const response = await fetch('/api/ai/execute-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, projectId })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to execute action');
      }
      return response.json();
    },
    onSuccess: (result, action) => {
      // Mark action as executed
      setMessages(prev => prev.map(msg => ({
        ...msg,
        actions: msg.actions?.map(a => 
          a.id === action.id ? { ...a, executed: true } : a
        )
      })));
      
      // Add system message about execution
      const systemMessage: ChatMessage = {
        id: `system_${Date.now()}`,
        role: 'assistant',
        content: `✅ **Action completed:** ${action.label}\n\n${result.message || 'Action executed successfully.'}`,
        timestamp: new Date(),
        projectId
      };
      setMessages(prev => [...prev, systemMessage]);
      
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tokens/budget'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tokens/usage'] });
      
      toast({
        title: "Action Completed",
        description: `Successfully executed: ${action.label}`,
      });
    },
    onError: (error: Error, action) => {
      toast({
        title: "Action Failed",
        description: `Failed to execute: ${action.label}. ${error.message}`,
        variant: "destructive"
      });
    }
  });

  const isAnyAttachmentProcessing = attachedFiles.some(
    (f) => f.status === "processing",
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMessageMutation.isPending) return;
    if (isAnyAttachmentProcessing) {
      toast({
        title: "Still attaching files",
        description: "Wait for files to finish processing before sending.",
      });
      return;
    }

    const fileSuffix = readyAttachmentCount
      ? `\n\n📎 ${readyAttachmentCount} file${readyAttachmentCount === 1 ? "" : "s"} attached`
      : "";

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: input.trim() + fileSuffix,
      timestamp: new Date(),
      projectId
    };

    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate(input.trim());
    setInput("");
    setAttachedFiles([]);
  };

  // Task #104 — one-click "improve this answer". Re-asks the model with a
  // refinement instruction targeting the low-scoring axes.
  const handleImprove = (
    priorUserQuery: string | undefined,
    quality: ChatMessage["quality"],
  ) => {
    if (sendMessageMutation.isPending || isAnyAttachmentProcessing) return;
    const prompt = buildImprovePrompt(priorUserQuery, quality);
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: "✨ Improve the previous answer",
      timestamp: new Date(),
      projectId,
    };
    setMessages((prev) => [...prev, userMessage]);
    sendMessageMutation.mutate(prompt);
  };

  const handleExecuteAction = (action: ChatAction) => {
    if (action.executed || executeActionMutation.isPending) return;
    executeActionMutation.mutate(action);
  };

  const quickSuggestions = [
    { icon: Plus, label: "Create Project", prompt: "Create a new project for building a mobile app" },
    { icon: FolderOpen, label: "View Projects", prompt: "Show me all my current projects" },
    { icon: Clock, label: "Overdue Tasks", prompt: "What tasks are overdue?" },
    { icon: BarChart3, label: "Project Analysis", prompt: "Analyze my project performance" },
    { icon: Target, label: "Optimize Timeline", prompt: "Help me optimize my project timeline" },
    { icon: Calendar, label: "This Week", prompt: "What should I focus on this week?" }
  ];

  const handleQuickSuggestion = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  return (
    <div
      {...getRootProps({
        className: cn(
          "flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative",
          className,
        ),
        onClick: undefined,
      })}
    >
      {isWindowDragging && (
        <div
          className="fixed inset-0 z-50 bg-gray-900/5"
          onDragOver={(e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={handleWindowDrop}
          data-testid="window-drop-overlay"
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
            <div className="bg-white border-2 border-dashed border-gray-900 shadow-xl rounded-2xl px-8 py-6 text-center max-w-md">
              <Upload className="h-8 w-8 text-gray-900 mx-auto mb-3" />
              <p className="text-base font-semibold text-gray-900">
                Drop anywhere to attach to chat
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Images, PDFs, Office docs, transcripts (.srt) — up to 100MB each
              </p>
            </div>
          </div>
        </div>
      )}
      {isDragActive && (
        <div className="absolute inset-0 z-30 bg-gray-900/5 border-2 border-dashed border-gray-900 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="bg-white border border-gray-200 shadow-lg rounded-xl px-6 py-4 text-center max-w-sm mx-4">
            <Upload className="h-6 w-6 text-gray-900 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">
              Drop files to attach
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Images, PDFs, Office docs, transcripts (.srt) — up to 100MB each
            </p>
          </div>
        </div>
      )}
      {/* Minimal Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Requisor AI Assistant</h3>
            <p className="text-xs text-gray-500 mt-0.5">Chat naturally to manage your projects</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-500">
              {projectId ? 'Project Mode' : 'General Mode'}
            </span>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <ScrollArea className="flex-1 px-6" ref={scrollAreaRef}>
        <div className="space-y-6 py-6">
          {messages.map((message, messageIndex) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === 'user' ? "justify-end" : "justify-start"
              )}
            >
              <div className={cn(
                "max-w-[85%]",
                message.role === 'user' ? "order-2" : ""
              )}>
                {/* Message bubble */}
                <div className={cn(
                  "rounded-2xl px-5 py-3",
                  message.role === 'user' 
                    ? "bg-gray-900 text-white" 
                    : "bg-gray-100 text-gray-900"
                )}>
                  {message.role === "assistant" &&
                  (message.citations?.length || 0) > 0 ? (
                    <div className="text-sm leading-relaxed prose prose-sm prose-gray max-w-none [&>p]:mb-2 [&>p]:leading-relaxed">
                      <RenderWithCitations
                        text={message.content}
                        citations={(message.citations || []) as Citation[]}
                        surface="brain"
                        sessionId={sessionId}
                      />
                      <SourcesFooter
                        citations={(message.citations || []) as Citation[]}
                        surface="brain"
                        sessionId={sessionId}
                      />
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>
                  )}
                </div>
                {/* Timestamp */}
                <div className={cn(
                  "mt-1.5 text-xs text-gray-400",
                  message.role === 'user' ? "text-right" : ""
                )}>
                  {format(message.timestamp, 'HH:mm')}
                </div>

                {/* Task #92: thumbs feedback under assistant messages only.
                    Find the nearest preceding user message so the feedback
                    row stores the actual prompt that produced this answer. */}
                {message.role !== 'user' && message.content?.trim() && (() => {
                  let priorUserQuery: string | undefined;
                  for (let i = messageIndex - 1; i >= 0; i--) {
                    if (messages[i].role === 'user' && messages[i].content?.trim()) {
                      priorUserQuery = messages[i].content;
                      break;
                    }
                  }
                  return (
                    <>
                      <MessageFeedback
                        surface="brain"
                        responseText={message.content}
                        query={priorUserQuery}
                        sessionId={sessionId}
                        modelUsed="gpt-4o"
                        retrievedChunkIds={message.retrievedChunkIds || []}
                        citationsEmitted={message.citationsEmitted || 0}
                        citationsStripped={message.citationsStripped || 0}
                        qualityFormat={message.quality?.scores?.format ?? null}
                        qualitySpecificity={
                          message.quality?.scores?.specificity ?? null
                        }
                        qualityCompleteness={
                          message.quality?.scores?.completeness ?? null
                        }
                        qualityReasons={
                          message.quality?.scores
                            ? {
                                format: message.quality.scores.formatReason,
                                specificity:
                                  message.quality.scores.specificityReason,
                                completeness:
                                  message.quality.scores.completenessReason,
                              }
                            : null
                        }
                      />
                      <QualityHint
                        quality={message.quality}
                        disabled={sendMessageMutation.isPending}
                        onImprove={() =>
                          handleImprove(priorUserQuery, message.quality)
                        }
                      />
                    </>
                  );
                })()}

                {/* Action Buttons */}
                {message.actions && message.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {message.actions.map((action) => (
                      <Button
                        key={action.id}
                        variant={action.executed ? "secondary" : "default"}
                        size="sm"
                        onClick={() => handleExecuteAction(action)}
                        disabled={action.executed || executeActionMutation.isPending}
                        className="text-xs"
                      >
                        {action.executed ? (
                          <CheckCircle className="w-3 h-3 mr-1" />
                        ) : executeActionMutation.isPending ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3 mr-1" />
                        )}
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl px-5 py-3">
                <div className="flex items-center space-x-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-sm text-gray-600">Thinking</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Quick Suggestions (when conversation is new) */}
      {messages.length <= 1 && (
        <div className="px-6 py-4">
          <p className="text-xs text-gray-400 mb-3 uppercase tracking-wider">Quick actions:</p>
          <div className="flex flex-wrap gap-2">
            {quickSuggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleQuickSuggestion(suggestion.prompt)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium 
                  border border-gray-200 bg-white hover:bg-gray-50 transition-all hover:border-gray-300
                  text-gray-700"
              >
                <suggestion.icon className="h-3 w-3" />
                <span>{suggestion.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <div className="p-6 bg-gray-50 border-t border-gray-100">
        {attachmentError && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
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
        {attachedFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachedFiles.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs",
                  f.status === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : f.status === "ready"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 bg-white text-gray-600",
                )}
              >
                {f.status === "processing" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : f.status === "error" ? (
                  <X className="h-3 w-3" />
                ) : (
                  <CheckCircle className="h-3 w-3" />
                )}
                <span className="max-w-[160px] truncate" title={f.name}>
                  {f.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(f.id)}
                  className="hover:text-gray-900 ml-0.5"
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRefiner(true)}
            disabled={sendMessageMutation.isPending}
            title="Refine your prompt with AI"
            className="flex-shrink-0 w-10 h-10 bg-white border border-gray-200 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder="Ask me anything about your projects..."
            disabled={sendMessageMutation.isPending}
            className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent placeholder-gray-400 text-sm"
          />
          <button
            type="submit"
            disabled={
              !input.trim() ||
              sendMessageMutation.isPending ||
              isAnyAttachmentProcessing
            }
            title={
              isAnyAttachmentProcessing
                ? "Waiting for attachments to finish processing…"
                : undefined
            }
            className="flex-shrink-0 w-10 h-10 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendMessageMutation.isPending || isAnyAttachmentProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send. Drag or paste files in to attach context.
        </p>
      </div>

      <PromptRefinerDialog
        open={showRefiner}
        onOpenChange={setShowRefiner}
        initialDraft={input}
        mode="general"
        onUsePrompt={(text) => setInput(text)}
      />
    </div>
  );
}