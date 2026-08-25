import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Sparkles,
  Save,
  Loader2,
  Bot,
  User,
  FileText,
  Database,
  Workflow,
  ListTodo,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RefinementMessage {
  role: "user" | "assistant";
  content: string;
  updates?: any;
}

interface FeatureRefinementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: {
    id: number;
    featureTitle: string;
    whyNow: string | null;
    evidence: string[] | null;
    uiChanges: string | null;
    dataModelChanges: string | null;
    workflowChanges: string | null;
    tasks: any;
    status: string | null;
  };
}

export function FeatureRefinementDialog({
  open,
  onOpenChange,
  candidate,
}: FeatureRefinementDialogProps) {
  const { toast } = useToast();
  const [editedFeature, setEditedFeature] = useState({
    featureTitle: candidate.featureTitle,
    whyNow: candidate.whyNow || "",
    uiChanges: candidate.uiChanges || "",
    dataModelChanges: candidate.dataModelChanges || "",
    workflowChanges: candidate.workflowChanges || "",
    tasks: Array.isArray(candidate.tasks) ? candidate.tasks : [],
  });
  const [chatMessages, setChatMessages] = useState<RefinementMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setEditedFeature({
        featureTitle: candidate.featureTitle,
        whyNow: candidate.whyNow || "",
        uiChanges: candidate.uiChanges || "",
        dataModelChanges: candidate.dataModelChanges || "",
        workflowChanges: candidate.workflowChanges || "",
        tasks: Array.isArray(candidate.tasks) ? candidate.tasks : [],
      });
      setChatMessages([]);
      setChatInput("");
    }
  }, [open, candidate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleAskAI = async () => {
    if (!chatInput.trim() || isRefining) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsRefining(true);

    try {
      const response = await apiRequest("/api/ai/refine-feature", {
        method: "POST",
        body: JSON.stringify({ message: userMessage, feature: editedFeature }),
      });
      const data = typeof response === "object" ? response : await response.json();

      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.text, updates: data.updates },
      ]);

      if (data.updates) {
        setEditedFeature((prev) => ({
          ...prev,
          ...(data.updates.featureTitle !== undefined && { featureTitle: data.updates.featureTitle }),
          ...(data.updates.whyNow !== undefined && { whyNow: data.updates.whyNow }),
          ...(data.updates.uiChanges !== undefined && { uiChanges: data.updates.uiChanges }),
          ...(data.updates.dataModelChanges !== undefined && { dataModelChanges: data.updates.dataModelChanges }),
          ...(data.updates.workflowChanges !== undefined && { workflowChanges: data.updates.workflowChanges }),
          ...(data.updates.tasks !== undefined && { tasks: data.updates.tasks }),
        }));
      }
    } catch (error: any) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't process that request. Please try again." },
      ]);
    } finally {
      setIsRefining(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiRequest(`/api/feature-candidates/${candidate.id}`, {
        method: "PATCH",
        body: JSON.stringify(editedFeature),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
      toast({ title: "Feature updated", description: "Changes saved successfully." });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskAI();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Refine Feature
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 min-h-0">
          <ScrollArea className="flex-1 max-h-[60vh]">
            <div className="space-y-4 pr-4">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Title</label>
                <Input
                  value={editedFeature.featureTitle}
                  onChange={(e) => setEditedFeature((prev) => ({ ...prev, featureTitle: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Why Now</label>
                <Textarea
                  value={editedFeature.whyNow}
                  onChange={(e) => setEditedFeature((prev) => ({ ...prev, whyNow: e.target.value }))}
                  className="mt-1"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-blue-600 uppercase tracking-wider flex items-center gap-1">
                    <FileText className="h-3 w-3" /> UI Changes
                  </label>
                  <Textarea
                    value={editedFeature.uiChanges}
                    onChange={(e) => setEditedFeature((prev) => ({ ...prev, uiChanges: e.target.value }))}
                    className="mt-1 text-sm"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-purple-600 uppercase tracking-wider flex items-center gap-1">
                    <Database className="h-3 w-3" /> Data Model
                  </label>
                  <Textarea
                    value={editedFeature.dataModelChanges}
                    onChange={(e) => setEditedFeature((prev) => ({ ...prev, dataModelChanges: e.target.value }))}
                    className="mt-1 text-sm"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-amber-600 uppercase tracking-wider flex items-center gap-1">
                    <Workflow className="h-3 w-3" /> Workflow
                  </label>
                  <Textarea
                    value={editedFeature.workflowChanges}
                    onChange={(e) => setEditedFeature((prev) => ({ ...prev, workflowChanges: e.target.value }))}
                    className="mt-1 text-sm"
                    rows={3}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <ListTodo className="h-3 w-3" /> Tasks ({editedFeature.tasks.length})
                </label>
                <div className="space-y-2 mt-1">
                  {editedFeature.tasks.map((t: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={t.name || t.title || ""}
                        onChange={(e) => {
                          const updated = [...editedFeature.tasks];
                          updated[i] = { ...updated[i], name: e.target.value };
                          setEditedFeature((prev) => ({ ...prev, tasks: updated }));
                        }}
                        className="text-sm"
                        placeholder={`Task ${i + 1}`}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-600 shrink-0"
                        onClick={() => {
                          const updated = editedFeature.tasks.filter((_: any, idx: number) => idx !== i);
                          setEditedFeature((prev) => ({ ...prev, tasks: updated }));
                        }}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditedFeature((prev) => ({ ...prev, tasks: [...prev.tasks, { name: "" }] }))}
                    className="text-xs"
                  >
                    + Add Task
                  </Button>
                </div>
              </div>

              {chatMessages.length > 0 && (
                <div className="border-t pt-3">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                    AI Refinement Chat
                  </label>
                  <div className="space-y-3">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
                            <Bot className="h-3.5 w-3.5 text-violet-600" />
                          </div>
                        )}
                        <div
                          className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                            msg.role === "user"
                              ? "bg-blue-500 text-white"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          {msg.updates && (
                            <Badge variant="outline" className="mt-2 text-xs border-violet-300 text-violet-600">
                              ✓ Spec fields updated
                            </Badge>
                          )}
                        </div>
                        {msg.role === "user" && (
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                            <User className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t pt-3 space-y-3">
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask the AI to refine this feature..."
                disabled={isRefining}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={handleAskAI}
                disabled={!chatInput.trim() || isRefining}
                className="bg-violet-500 hover:bg-violet-600 text-white"
              >
                {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex gap-2 text-xs text-slate-400 flex-wrap">
              {["Would a simpler approach work?", "What's the MVP version?", "Add acceptance criteria", "Estimate effort"].map((s) => (
                <button
                  key={s}
                  onClick={() => setChatInput(s)}
                  className="px-2 py-1 rounded-full border border-slate-200 hover:border-violet-300 hover:text-violet-600 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
