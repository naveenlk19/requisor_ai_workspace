import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Download,
  Copy,
  Share2,
  FileText,
  CheckCircle,
  Loader2,
  Link2,
  ExternalLink,
  Zap,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface FeatureCandidate {
  id: number;
  featureTitle: string;
  whyNow: string | null;
  evidence: string[] | null;
  uiChanges: string | null;
  dataModelChanges: string | null;
  workflowChanges: string | null;
  tasks: any;
  status: string | null;
  impactScore: number | null;
  effortScore: number | null;
  confidenceScore: number | null;
  riceScore: number | null;
  priorityRank: number | null;
  scoreReasoning: any;
}

interface ExportReportProps {
  candidates: FeatureCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getQuadrantLabel(impact: number, effort: number): string {
  if (impact >= 50 && effort < 50) return "Quick Win";
  if (impact >= 50 && effort >= 50) return "Major Project";
  if (impact < 50 && effort < 50) return "Fill-In";
  return "Avoid";
}

function generateMarkdown(candidates: FeatureCandidate[], title: string): string {
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const scored = candidates.filter((c) => c.riceScore != null);
  const approved = candidates.filter((c) => c.status === "approved");
  const pending = candidates.filter((c) => c.status !== "approved");
  const quickWins = scored.filter((c) => (c.impactScore ?? 0) >= 60 && (c.effortScore ?? 100) <= 40);
  const sorted = [...candidates].sort((a, b) => (b.riceScore ?? 0) - (a.riceScore ?? 0));

  let md = `# ${title}\n\n`;
  md += `**Generated:** ${now}  \n`;
  md += `**Total Features:** ${candidates.length} | **Approved:** ${approved.length} | **Pending:** ${pending.length}\n\n`;

  md += `---\n\n`;
  md += `## Discovery Summary\n\n`;

  const evidenceCount = candidates.reduce((acc, c) => acc + (c.evidence?.length ?? 0), 0);
  md += `- **${candidates.length}** feature candidates identified\n`;
  md += `- **${evidenceCount}** evidence points collected\n`;
  if (scored.length > 0) {
    md += `- **${scored.length}** features scored and prioritized\n`;
  }
  if (quickWins.length > 0) {
    md += `- **${quickWins.length}** Quick Win${quickWins.length !== 1 ? "s" : ""} identified (high impact, low effort)\n`;
  }
  md += `\n`;

  if (scored.length > 0) {
    md += `## Priority Matrix\n\n`;
    md += `| Rank | Feature | Impact | Effort | Confidence | RICE Score | Category |\n`;
    md += `|------|---------|--------|--------|------------|------------|----------|\n`;
    sorted.forEach((c, i) => {
      const impact = c.impactScore ?? "—";
      const effort = c.effortScore ?? "—";
      const conf = c.confidenceScore ?? "—";
      const rice = c.riceScore ?? "—";
      const cat = c.impactScore != null && c.effortScore != null
        ? getQuadrantLabel(c.impactScore, c.effortScore)
        : "—";
      md += `| ${c.priorityRank ?? i + 1} | ${c.featureTitle} | ${impact} | ${effort} | ${conf} | ${rice} | ${cat} |\n`;
    });
    md += `\n`;
  }

  md += `## Feature Recommendations\n\n`;
  sorted.forEach((c, i) => {
    md += `### ${i + 1}. ${c.featureTitle}`;
    if (c.status === "approved") md += ` ✅`;
    md += `\n\n`;

    if (c.whyNow) {
      md += `**Why Now:** ${c.whyNow}\n\n`;
    }

    if (c.riceScore != null) {
      md += `**Scores:** Impact ${c.impactScore ?? "—"} · Effort ${c.effortScore ?? "—"} · Confidence ${c.confidenceScore ?? "—"} · RICE ${c.riceScore}\n\n`;
    }

    if (c.evidence && c.evidence.length > 0) {
      md += `**Evidence:**\n`;
      c.evidence.forEach((e) => {
        md += `- ${e}\n`;
      });
      md += `\n`;
    }

    const scope: string[] = [];
    if (c.uiChanges) scope.push(`- **UI Changes:** ${c.uiChanges}`);
    if (c.dataModelChanges) scope.push(`- **Data Model:** ${c.dataModelChanges}`);
    if (c.workflowChanges) scope.push(`- **Workflow:** ${c.workflowChanges}`);
    if (scope.length > 0) {
      md += `**Implementation Scope:**\n${scope.join("\n")}\n\n`;
    }

    const tasks = Array.isArray(c.tasks) ? c.tasks : [];
    if (tasks.length > 0) {
      md += `**Tasks (${tasks.length}):**\n`;
      tasks.forEach((t: any) => {
        md += `- ${t.name || t.title}\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;
  });

  md += `## Recommended Build Order\n\n`;
  if (quickWins.length > 0) {
    md += `**Phase 1 — Quick Wins** (ship first for immediate impact)\n`;
    quickWins.forEach((c, i) => {
      md += `${i + 1}. ${c.featureTitle} (RICE: ${c.riceScore})\n`;
    });
    md += `\n`;
  }

  const majorProjects = sorted.filter(
    (c) => !quickWins.some((q) => q.id === c.id) && (c.impactScore ?? 0) >= 50
  );
  if (majorProjects.length > 0) {
    md += `**Phase ${quickWins.length > 0 ? "2" : "1"} — Strategic Investments**\n`;
    majorProjects.forEach((c, i) => {
      md += `${i + 1}. ${c.featureTitle} (RICE: ${c.riceScore ?? "—"})\n`;
    });
    md += `\n`;
  }

  const remaining = sorted.filter(
    (c) => !quickWins.some((q) => q.id === c.id) && !majorProjects.some((m) => m.id === c.id)
  );
  if (remaining.length > 0) {
    md += `**Backlog**\n`;
    remaining.forEach((c, i) => {
      md += `${i + 1}. ${c.featureTitle} (RICE: ${c.riceScore ?? "—"})\n`;
    });
    md += `\n`;
  }

  md += `---\n*Report generated by Requisor AI Discovery Engine*\n`;
  return md;
}

export function ExportReport({ candidates, open, onOpenChange }: ExportReportProps) {
  const [reportTitle, setReportTitle] = useState("Product Discovery Report");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyMarkdown = () => {
    const md = generateMarkdown(candidates, reportTitle);
    navigator.clipboard.writeText(md).then(() => {
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2000);
      toast({ title: "Copied!", description: "Markdown report copied to clipboard" });
    });
  };

  const handleDownloadMarkdown = () => {
    const md = generateMarkdown(candidates, reportTitle);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportTitle.replace(/\s+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: "Markdown file saved" });
  };

  const handleExportPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = 20;

      const checkPage = (needed: number) => {
        if (y + needed > doc.internal.pageSize.getHeight() - 15) {
          doc.addPage();
          y = 20;
        }
      };

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(reportTitle, margin, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      doc.text(`Generated: ${now}`, margin, y);
      y += 4;
      const approved = candidates.filter((c) => c.status === "approved").length;
      doc.text(`${candidates.length} features | ${approved} approved`, margin, y);
      y += 10;

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Priority Matrix", margin, y);
      y += 6;

      const scored = candidates.filter((c) => c.riceScore != null);
      const sorted = [...candidates].sort((a, b) => (b.riceScore ?? 0) - (a.riceScore ?? 0));

      if (scored.length > 0) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        const cols = [margin, margin + 8, margin + 65, margin + 80, margin + 95, margin + 110, margin + 130];
        doc.text("#", cols[0], y);
        doc.text("Feature", cols[1], y);
        doc.text("Impact", cols[2], y);
        doc.text("Effort", cols[3], y);
        doc.text("Conf.", cols[4], y);
        doc.text("RICE", cols[5], y);
        doc.text("Category", cols[6], y);
        y += 1;
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 4;

        doc.setFont("helvetica", "normal");
        sorted.forEach((c, i) => {
          checkPage(6);
          const rank = (c.priorityRank ?? i + 1).toString();
          const title = c.featureTitle.length > 30 ? c.featureTitle.slice(0, 28) + "…" : c.featureTitle;
          const cat = c.impactScore != null && c.effortScore != null
            ? getQuadrantLabel(c.impactScore, c.effortScore)
            : "—";
          doc.text(rank, cols[0], y);
          doc.text(title, cols[1], y);
          doc.text((c.impactScore ?? "—").toString(), cols[2], y);
          doc.text((c.effortScore ?? "—").toString(), cols[3], y);
          doc.text((c.confidenceScore ?? "—").toString(), cols[4], y);
          doc.text((c.riceScore ?? "—").toString(), cols[5], y);
          doc.text(cat, cols[6], y);
          y += 5;
        });
        y += 6;
      }

      checkPage(10);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Feature Recommendations", margin, y);
      y += 8;

      sorted.forEach((c, i) => {
        checkPage(20);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        const statusLabel = c.status === "approved" ? " [Approved]" : "";
        doc.text(`${i + 1}. ${c.featureTitle}${statusLabel}`, margin, y);
        y += 5;

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");

        if (c.whyNow) {
          checkPage(8);
          doc.setFont("helvetica", "italic");
          const lines = doc.splitTextToSize(`Why Now: ${c.whyNow}`, contentWidth);
          doc.text(lines, margin, y);
          y += lines.length * 3.5;
          doc.setFont("helvetica", "normal");
        }

        if (c.riceScore != null) {
          checkPage(5);
          doc.text(`Scores: Impact ${c.impactScore ?? "—"} | Effort ${c.effortScore ?? "—"} | Confidence ${c.confidenceScore ?? "—"} | RICE ${c.riceScore}`, margin, y);
          y += 4;
        }

        if (c.evidence && c.evidence.length > 0) {
          checkPage(5);
          doc.setFont("helvetica", "bold");
          doc.text("Evidence:", margin, y);
          y += 3.5;
          doc.setFont("helvetica", "normal");
          c.evidence.forEach((e) => {
            checkPage(5);
            const lines = doc.splitTextToSize(`• ${e}`, contentWidth - 4);
            doc.text(lines, margin + 2, y);
            y += lines.length * 3.5;
          });
        }

        y += 4;
        doc.setDrawColor(230, 230, 230);
        doc.line(margin, y, pageWidth - margin, y);
        y += 5;
      });

      doc.save(`${reportTitle.replace(/\s+/g, "_")}.pdf`);
      toast({ title: "PDF Exported", description: "Your discovery report has been downloaded" });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleCreateShareLink = async () => {
    setIsCreatingLink(true);
    try {
      const md = generateMarkdown(candidates, reportTitle);
      const reportData = {
        title: reportTitle,
        markdown: md,
        candidates: candidates.map((c) => ({
          featureTitle: c.featureTitle,
          whyNow: c.whyNow,
          evidence: c.evidence,
          uiChanges: c.uiChanges,
          dataModelChanges: c.dataModelChanges,
          workflowChanges: c.workflowChanges,
          tasks: c.tasks,
          status: c.status,
          impactScore: c.impactScore,
          effortScore: c.effortScore,
          confidenceScore: c.confidenceScore,
          riceScore: c.riceScore,
          priorityRank: c.priorityRank,
        })),
        generatedAt: new Date().toISOString(),
      };

      const result = await apiRequest("/api/discovery-reports", {
        method: "POST",
        body: JSON.stringify({ title: reportTitle, reportData }),
      });

      const url = `${window.location.origin}/shared-report/${result.shareToken}`;
      setShareUrl(url);
      toast({ title: "Share link created!", description: "Anyone with the link can view this report" });
    } catch (error) {
      console.error("Share link error:", error);
      toast({ title: "Error", description: "Failed to create share link", variant: "destructive" });
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleCopyLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
        toast({ title: "Link copied!" });
      });
    }
  };

  const scored = candidates.filter((c) => c.riceScore != null);
  const quickWins = scored.filter((c) => (c.impactScore ?? 0) >= 60 && (c.effortScore ?? 100) <= 40);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-500" />
            Export Discovery Report
          </DialogTitle>
          <DialogDescription>
            Export or share your feature discovery findings with stakeholders
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Report Title</label>
            <Input
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder="Product Discovery Report"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {candidates.length} features
            </Badge>
            {scored.length > 0 && (
              <Badge variant="outline" className="text-xs border-indigo-200 text-indigo-700 bg-indigo-50">
                {scored.length} scored
              </Badge>
            )}
            {quickWins.length > 0 && (
              <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">
                <Zap className="h-3 w-3 mr-0.5" />
                {quickWins.length} Quick Win{quickWins.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-700">Export Options</h4>

            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="outline"
                onClick={handleExportPdf}
                disabled={isGeneratingPdf}
                className="justify-start h-auto py-3 px-4"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="h-4 w-4 mr-3 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-3 text-red-500" />
                )}
                <div className="text-left">
                  <div className="text-sm font-medium">Download PDF</div>
                  <div className="text-xs text-slate-400">Professional report with priority matrix</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={handleDownloadMarkdown}
                className="justify-start h-auto py-3 px-4"
              >
                <Download className="h-4 w-4 mr-3 text-slate-500" />
                <div className="text-left">
                  <div className="text-sm font-medium">Download Markdown</div>
                  <div className="text-xs text-slate-400">Editable .md file for docs or wikis</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={handleCopyMarkdown}
                className="justify-start h-auto py-3 px-4"
              >
                {copiedMarkdown ? (
                  <CheckCircle className="h-4 w-4 mr-3 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4 mr-3 text-blue-500" />
                )}
                <div className="text-left">
                  <div className="text-sm font-medium">
                    {copiedMarkdown ? "Copied!" : "Copy as Markdown"}
                  </div>
                  <div className="text-xs text-slate-400">Paste into Notion, Confluence, etc.</div>
                </div>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-700">Stakeholder Sharing</h4>

            {shareUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <Link2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 text-xs bg-transparent border-none outline-none text-emerald-800 font-mono truncate"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyLink}
                    className="h-7 px-2 text-xs shrink-0"
                  >
                    {copiedLink ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(shareUrl, "_blank")}
                    className="h-7 px-2 text-xs shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  Anyone with this link can view the report (read-only)
                </p>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={handleCreateShareLink}
                disabled={isCreatingLink}
                className="justify-start h-auto py-3 px-4 w-full"
              >
                {isCreatingLink ? (
                  <Loader2 className="h-4 w-4 mr-3 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4 mr-3 text-violet-500" />
                )}
                <div className="text-left">
                  <div className="text-sm font-medium">
                    {isCreatingLink ? "Creating link..." : "Create Share Link"}
                  </div>
                  <div className="text-xs text-slate-400">Generate a read-only link for stakeholders</div>
                </div>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
