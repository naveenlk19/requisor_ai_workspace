import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  Copy,
  Code2,
  Terminal,
  Cpu,
  Heart,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Download,
  ExternalLink,
  FileText,
  Database,
  Workflow,
  ListTodo,
  Zap,
  CheckCircle,
  Edit3,
  ArrowRight,
  Rocket,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  CODING_AGENTS,
  generateAgentPrompt,
  generateBatchAgentPrompt,
  type CodingAgent,
  type FeatureData,
} from "@/lib/agentPrompt";

interface SendToAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: {
    id?: number;
    featureTitle: string;
    whyNow: string | null;
    evidence: string[] | null;
    uiChanges: string | null;
    dataModelChanges: string | null;
    workflowChanges: string | null;
    tasks: any;
  };
  candidates?: Array<{
    id?: number;
    featureTitle: string;
    whyNow: string | null;
    evidence: string[] | null;
    uiChanges: string | null;
    dataModelChanges: string | null;
    workflowChanges: string | null;
    tasks: any;
  }>;
  projectName?: string;
  projectDescription?: string;
  isBatch?: boolean;
}

const agentIcons: Record<CodingAgent, typeof Code2> = {
  replit: Terminal,
  "claude-code": Code2,
  cursor: Cpu,
  lovable: Heart,
};

const agentColors: Record<CodingAgent, string> = {
  replit: "border-blue-500 bg-blue-50",
  "claude-code": "border-orange-500 bg-orange-50",
  cursor: "border-purple-500 bg-purple-50",
  lovable: "border-pink-500 bg-pink-50",
};

const agentIconBg: Record<CodingAgent, string> = {
  replit: "bg-blue-500",
  "claude-code": "bg-orange-500",
  cursor: "bg-purple-500",
  lovable: "bg-pink-500",
};

const agentTextColor: Record<CodingAgent, string> = {
  replit: "text-blue-700",
  "claude-code": "text-orange-700",
  cursor: "text-purple-700",
  lovable: "text-pink-700",
};

type WizardStep = "review" | "select-agent" | "handoff";

const STEP_ORDER: WizardStep[] = ["review", "select-agent", "handoff"];

export function SendToAgentDialog({
  open,
  onOpenChange,
  candidate,
  candidates,
  projectName,
  projectDescription,
  isBatch = false,
}: SendToAgentDialogProps) {
  const [step, setStep] = useState<WizardStep>("review");
  const [selectedAgent, setSelectedAgent] = useState<CodingAgent>("replit");
  const [copied, setCopied] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState("");
  const [isCustomized, setIsCustomized] = useState(false);

  const allCandidates = isBatch && candidates ? candidates : [candidate];

  const featureDataList: FeatureData[] = allCandidates.map((c) => ({
    ...c,
    projectContext: (projectName || projectDescription)
      ? {
          projectName: projectName || undefined,
          projectDescription: projectDescription || undefined,
        }
      : undefined,
  }));

  const generatedPrompt = isBatch
    ? generateBatchAgentPrompt(featureDataList, selectedAgent)
    : generateAgentPrompt(featureDataList[0], selectedAgent);

  const selectedAgentInfo = CODING_AGENTS.find((a) => a.id === selectedAgent);

  useEffect(() => {
    if (open) {
      setStep("review");
      setCopied(false);
      setLaunched(false);
      setIsCustomized(false);
    }
  }, [open]);

  useEffect(() => {
    if (step === "handoff") {
      setEditablePrompt(generatedPrompt);
      setIsCustomized(false);
    }
  }, [step, selectedAgent]);

  const trackHandoff = useCallback(async () => {
    for (const c of allCandidates) {
      if (c.id) {
        try {
          await apiRequest(`/api/feature-candidates/${c.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              lastSentToAgent: selectedAgent,
              lastSentAt: new Date().toISOString(),
            }),
          });
        } catch {}
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
  }, [selectedAgent, allCandidates]);

  const handleCopy = useCallback(async () => {
    const textToCopy = isCustomized ? editablePrompt : generatedPrompt;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast({
        title: "Prompt copied!",
        description: `Paste this into ${selectedAgentInfo?.name} to start building`,
      });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      toast({
        title: "Prompt copied!",
        description: `Paste this into ${selectedAgentInfo?.name} to start building`,
      });
      setTimeout(() => setCopied(false), 3000);
    }
    await trackHandoff();
  }, [isCustomized, editablePrompt, generatedPrompt, selectedAgentInfo, trackHandoff]);

  const handleDownload = async () => {
    const textToDownload = isCustomized ? editablePrompt : generatedPrompt;
    const fileName = isBatch
      ? `batch-implementation-${selectedAgent}.md`
      : `${candidate.featureTitle.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-${selectedAgent}.md`;
    const blob = new Blob([textToDownload], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Prompt downloaded",
      description: `Saved as ${fileName}`,
    });
    await trackHandoff();
  };

  const handleLaunch = async () => {
    if (selectedAgentInfo) {
      window.open(selectedAgentInfo.deepLink, "_blank");
      setLaunched(true);
      toast({
        title: `${selectedAgentInfo.name} opened`,
        description: "Paste your copied prompt to start building",
      });
      await trackHandoff();
    }
  };

  const handlePromptEdit = (value: string) => {
    setEditablePrompt(value);
    setIsCustomized(value !== generatedPrompt);
  };

  const stepIndex = STEP_ORDER.indexOf(step);

  const goNext = () => {
    if (stepIndex < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[stepIndex + 1]);
    }
  };

  const goBack = () => {
    if (stepIndex > 0) {
      setStep(STEP_ORDER[stepIndex - 1]);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleDialogKeys = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && step !== "handoff") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" && stepIndex > 0) {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", handleDialogKeys);
    return () => window.removeEventListener("keydown", handleDialogKeys);
  }, [open, step, stepIndex]);

  const tasks = Array.isArray(candidate.tasks) ? candidate.tasks : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-1 px-6 pt-5 pb-3">
          {STEP_ORDER.map((s, i) => {
            const isActive = i === stepIndex;
            const isDone = i < stepIndex;
            const labels = ["Review Feature", "Select Agent", "Launch"];
            return (
              <div key={s} className="flex items-center gap-1 flex-1">
                <button
                  onClick={() => { if (isDone) setStep(s); }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300"
                      : isDone
                        ? "bg-emerald-50 text-emerald-700 cursor-pointer hover:bg-emerald-100"
                        : "bg-slate-50 text-slate-400"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive
                      ? "bg-indigo-500 text-white"
                      : isDone
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-200 text-slate-500"
                  }`}>
                    {isDone ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{labels[i]}</span>
                </button>
                {i < STEP_ORDER.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 mx-1 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t" />

        <div className="flex-1 min-h-0 flex flex-col">
          {step === "review" && (
            <>
              <DialogHeader className="px-6 pt-4 pb-2">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5 text-indigo-500" />
                  {isBatch ? `Review ${allCandidates.length} Features` : "Review Feature Spec"}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {isBatch
                    ? "Review the features that will be included in the batch prompt"
                    : "Confirm the feature details before generating the implementation prompt"}
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="flex-1 min-h-0 px-6 pb-4">
                <div className="space-y-4 pt-2">
                  {allCandidates.map((c, idx) => (
                    <div key={idx} className={`space-y-3 ${isBatch && idx > 0 ? "border-t pt-4" : ""}`}>
                      {isBatch && (
                        <Badge variant="outline" className="text-xs mb-1">Feature {idx + 1} of {allCandidates.length}</Badge>
                      )}
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{c.featureTitle}</h3>
                        {c.whyNow && (
                          <p className="text-sm text-slate-600 mt-1">{c.whyNow}</p>
                        )}
                      </div>

                      {c.evidence && c.evidence.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Evidence ({c.evidence.length})</p>
                          <div className="space-y-1">
                            {c.evidence.map((e, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-sm text-slate-600">
                                <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-emerald-500 flex-shrink-0" />
                                <span>{e}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {c.uiChanges && (
                          <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                            <div className="flex items-center gap-1 text-xs font-medium text-blue-700 mb-1">
                              <FileText className="h-3 w-3" />
                              UI Changes
                            </div>
                            <p className="text-xs text-blue-600">{c.uiChanges}</p>
                          </div>
                        )}
                        {c.dataModelChanges && (
                          <div className="p-2.5 bg-purple-50 rounded-lg border border-purple-100">
                            <div className="flex items-center gap-1 text-xs font-medium text-purple-700 mb-1">
                              <Database className="h-3 w-3" />
                              Data Model
                            </div>
                            <p className="text-xs text-purple-600">{c.dataModelChanges}</p>
                          </div>
                        )}
                        {c.workflowChanges && (
                          <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                            <div className="flex items-center gap-1 text-xs font-medium text-amber-700 mb-1">
                              <Workflow className="h-3 w-3" />
                              Workflow
                            </div>
                            <p className="text-xs text-amber-600">{c.workflowChanges}</p>
                          </div>
                        )}
                      </div>

                      {Array.isArray(c.tasks) && c.tasks.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1 text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                            <ListTodo className="h-3 w-3" />
                            Tasks ({c.tasks.length})
                          </div>
                          <div className="space-y-1">
                            {c.tasks.slice(0, 6).map((t: any, i: number) => (
                              <div key={i} className="text-xs text-slate-600 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                                {t.name || t.title}
                              </div>
                            ))}
                            {c.tasks.length > 6 && (
                              <p className="text-xs text-slate-400">+{c.tasks.length - 6} more</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          {step === "select-agent" && (
            <>
              <DialogHeader className="px-6 pt-4 pb-2">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Code2 className="h-5 w-5 text-indigo-500" />
                  Choose Your Coding Agent
                </DialogTitle>
                <DialogDescription className="text-sm">
                  Each agent generates a tailored prompt optimized for its platform
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="flex-1 min-h-0 px-6 pb-4">
                <div className="space-y-3 pt-2">
                  {CODING_AGENTS.map((agent) => {
                    const IconComponent = agentIcons[agent.id];
                    const isSelected = selectedAgent === agent.id;
                    return (
                      <button
                        key={agent.id}
                        onClick={() => {
                          setSelectedAgent(agent.id);
                          setCopied(false);
                        }}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                          isSelected
                            ? `${agentColors[agent.id]} shadow-sm`
                            : "border-slate-200 hover:border-slate-300 bg-white hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isSelected ? `${agentIconBg[agent.id]} text-white` : "bg-slate-100 text-slate-600"
                          }`}>
                            <IconComponent className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-sm font-semibold ${isSelected ? agentTextColor[agent.id] : "text-slate-800"}`}>
                                {agent.name}
                              </span>
                              {isSelected && (
                                <Badge className="text-[10px] bg-indigo-500 text-white px-1.5 py-0">Selected</Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mb-2">{agent.description}</p>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {agent.strengths.map((s) => (
                                <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  {s}
                                </span>
                              ))}
                            </div>
                            {isSelected && (
                              <div className="mt-2 space-y-2">
                                <div className="flex items-center gap-1.5 text-[11px] text-indigo-600 bg-indigo-50 rounded-md px-3 py-1.5">
                                  <Sparkles className="h-3 w-3 flex-shrink-0" />
                                  <span>{agent.platformTip}</span>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Best Practices</p>
                                  {agent.bestPractices.map((tip, i) => (
                                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                                      <Zap className="h-3 w-3 mt-0.5 text-amber-500 flex-shrink-0" />
                                      <span>{tip}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}

          {step === "handoff" && (
            <>
              <DialogHeader className="px-6 pt-4 pb-2">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Rocket className="h-5 w-5 text-indigo-500" />
                  Launch with {selectedAgentInfo?.name}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  Copy the prompt, then open {selectedAgentInfo?.name} and paste it to start building
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 min-h-0 flex flex-col px-6 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Generated Prompt
                    </p>
                    {isCustomized && (
                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 bg-amber-50">
                        <Edit3 className="h-2.5 w-2.5 mr-0.5" />
                        Customized
                      </Badge>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {(isCustomized ? editablePrompt : generatedPrompt).length} characters
                  </Badge>
                </div>
                <div className="flex-1 min-h-0 relative">
                  <Textarea
                    value={editablePrompt || generatedPrompt}
                    onChange={(e) => handlePromptEdit(e.target.value)}
                    className="h-[250px] font-mono text-xs leading-relaxed resize-none bg-slate-50 border-slate-200"
                  />
                </div>

                <div className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={handleCopy}
                      size="lg"
                      className={`${
                        copied
                          ? "bg-emerald-500 hover:bg-emerald-600"
                          : "bg-indigo-500 hover:bg-indigo-600"
                      } text-white transition-all`}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Prompt
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleLaunch}
                      size="lg"
                      variant={launched ? "outline" : "default"}
                      className={launched
                        ? "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                        : `${agentIconBg[selectedAgent]} hover:opacity-90 text-white`
                      }
                    >
                      {launched ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Opened
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open {selectedAgentInfo?.name}
                        </>
                      )}
                    </Button>
                  </div>

                  <Button
                    onClick={handleDownload}
                    variant="outline"
                    size="sm"
                    className="w-full text-slate-600"
                  >
                    <Download className="h-3.5 w-3.5 mr-2" />
                    Download as .md file
                  </Button>

                  {(copied || launched) && (
                    <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <Sparkles className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-emerald-800">
                          {copied && launched
                            ? "You're all set!"
                            : copied
                              ? `Now open ${selectedAgentInfo?.name} and paste your prompt`
                              : `Copy the prompt, then paste it in ${selectedAgentInfo?.name}`
                          }
                        </p>
                        <p className="text-xs text-emerald-600 mt-0.5">
                          {copied && launched
                            ? "Paste the prompt to start building your feature"
                            : "The prompt is tailored for the best results with this agent"
                          }
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="border-t px-6 py-3 flex items-center justify-between bg-slate-50/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={stepIndex === 0}
            className="text-slate-500"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-slate-400"
            >
              Close
            </Button>
            {stepIndex < STEP_ORDER.length - 1 && (
              <Button
                size="sm"
                onClick={goNext}
                className="bg-indigo-500 hover:bg-indigo-600 text-white"
              >
                {step === "review" ? "Choose Agent" : "Preview & Launch"}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
