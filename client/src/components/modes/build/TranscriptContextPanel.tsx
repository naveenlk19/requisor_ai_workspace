import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  Upload,
  X,
  MessageSquare,
  StickyNote,
  Plus,
  Trash2,
  Mic,
  Loader2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useDropzone } from "react-dropzone";
import { toast } from "@/hooks/use-toast";
import { ConversationSelector } from "@/components/meetings/ConversationSelector";

interface ContextItem {
  id: string;
  type: "transcript" | "file" | "note";
  title: string;
  content: string;
  source?: string;
}

interface TranscriptContextPanelProps {
  contextItems: ContextItem[];
  onContextChange: (items: ContextItem[]) => void;
  isProcessing?: boolean;
  selectedConversationIds?: number[];
  onConversationSelectionChange?: (ids: number[]) => void;
}

export function TranscriptContextPanel({
  contextItems,
  onContextChange,
  isProcessing,
  selectedConversationIds = [],
  onConversationSelectionChange,
}: TranscriptContextPanelProps) {
  const [noteInput, setNoteInput] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);

  const handleFileDrop = async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const text = await file.text();
      const newItem: ContextItem = {
        id: "ctx_" + Date.now() + "_" + Math.random().toString(36).slice(2),
        type: file.name.includes("transcript") || file.type === "text/plain"
          ? "transcript"
          : "file",
        title: file.name,
        content: text,
        source: file.name,
      };
      onContextChange([...contextItems, newItem]);
    }
    toast({
      title: "Files added",
      description: `${acceptedFiles.length} file(s) added to context`,
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      "text/plain": [".txt"],
      "text/csv": [".csv"],
      "application/json": [".json"],
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxSize: 50 * 1024 * 1024,
  });

  const handleAudioUpload = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    setIsTranscribing(true);
    setAudioUploadProgress(10);

    const progressInterval = setInterval(() => {
      setAudioUploadProgress((prev) => Math.min(prev + 5, 90));
    }, 500);

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("autoSave", "true");

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      clearInterval(progressInterval);
      setAudioUploadProgress(100);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Transcription failed");
      }

      const data = await res.json();
      const newItem: ContextItem = {
        id: "audio_" + Date.now(),
        type: "transcript",
        title: file.name.replace(/\.[^/.]+$/, ""),
        content: data.transcript,
        source: "audio-transcription",
      };
      onContextChange([...contextItems, newItem]);
      toast({ title: "Recording transcribed", description: "Audio transcript added to context." });
    } catch (err: any) {
      toast({ title: "Transcription failed", description: err.message || "Could not transcribe audio.", variant: "destructive" });
    } finally {
      clearInterval(progressInterval);
      setIsTranscribing(false);
      setTimeout(() => setAudioUploadProgress(0), 1000);
    }
  };

  const {
    getRootProps: getAudioRootProps,
    getInputProps: getAudioInputProps,
    isDragActive: isAudioDragActive,
  } = useDropzone({
    onDrop: handleAudioUpload,
    accept: {
      "audio/mpeg": [".mp3"],
      "audio/mp4": [".m4a"],
      "audio/wav": [".wav"],
      "audio/webm": [".webm"],
      "video/mp4": [".mp4"],
      "video/webm": [".webm"],
    },
    maxSize: 25 * 1024 * 1024,
    maxFiles: 1,
    disabled: isTranscribing,
  });

  const addNote = () => {
    if (!noteInput.trim()) return;
    const newItem: ContextItem = {
      id: "note_" + Date.now(),
      type: "note",
      title: "Pasted Note",
      content: noteInput.trim(),
    };
    onContextChange([...contextItems, newItem]);
    setNoteInput("");
    setShowNoteInput(false);
  };

  const removeItem = (id: string) => {
    onContextChange(contextItems.filter((item) => item.id !== id));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "transcript":
        return <MessageSquare className="h-3.5 w-3.5" />;
      case "file":
        return <FileText className="h-3.5 w-3.5" />;
      case "note":
        return <StickyNote className="h-3.5 w-3.5" />;
      default:
        return <FileText className="h-3.5 w-3.5" />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case "transcript":
        return "border-blue-200 bg-blue-50 text-blue-700";
      case "file":
        return "border-purple-200 bg-purple-50 text-purple-700";
      case "note":
        return "border-amber-200 bg-amber-50 text-amber-700";
      default:
        return "border-slate-200 bg-slate-50 text-slate-700";
    }
  };

  return (
    <Card className="border-slate-200 h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-orange-500" />
            Context Sources
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {contextItems.length} items
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {onConversationSelectionChange && (
          <ConversationSelector
            selectedIds={selectedConversationIds}
            onSelectionChange={onConversationSelectionChange}
          />
        )}

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
            isDragActive
              ? "border-orange-400 bg-orange-50"
              : "border-slate-200 hover:border-orange-300 hover:bg-orange-50/30"
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="h-5 w-5 mx-auto text-slate-400 mb-1" />
          <p className="text-xs text-slate-500">
            {isDragActive
              ? "Drop files here..."
              : "Drop transcripts, files, or docs here"}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Slack, Zoom, Meet, Teams exports
          </p>
        </div>

        <div
          {...getAudioRootProps()}
          className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
            isAudioDragActive
              ? "border-violet-400 bg-violet-50"
              : isTranscribing
              ? "border-violet-300 bg-violet-50/50"
              : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/30"
          }`}
        >
          <input {...getAudioInputProps()} />
          {isTranscribing ? (
            <>
              <Loader2 className="h-5 w-5 mx-auto text-violet-500 mb-1 animate-spin" />
              <p className="text-xs text-violet-600 font-medium">Transcribing...</p>
            </>
          ) : (
            <>
              <Mic className="h-5 w-5 mx-auto text-violet-400 mb-1" />
              <p className="text-xs text-slate-500">
                {isAudioDragActive ? "Drop recording..." : "Upload recording to transcribe"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                MP3, MP4, WAV, M4A, WebM (≤25MB)
              </p>
            </>
          )}
        </div>

        {audioUploadProgress > 0 && (
          <Progress value={audioUploadProgress} className="h-1.5" />
        )}

        {!showNoteInput ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setShowNoteInput(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Paste Notes
          </Button>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Paste meeting notes, user feedback, or observations..."
              className="text-xs min-h-[80px] resize-none"
            />
            <div className="flex gap-1">
              <Button size="sm" className="text-xs flex-1" onClick={addNote}>
                Add Note
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  setShowNoteInput(false);
                  setNoteInput("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2">
            {contextItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-2 p-2 rounded-md border ${getColor(
                  item.type
                )}`}
              >
                <div className="mt-0.5">{getIcon(item.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.title}</p>
                  <p className="text-xs opacity-70 line-clamp-2">
                    {item.content.substring(0, 100)}
                    {item.content.length > 100 ? "..." : ""}
                  </p>
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {contextItems.length === 0 && (
              <div className="text-center py-4">
                <MessageSquare className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-400">
                  No context added yet.
                </p>
                <p className="text-xs text-slate-400">
                  Import transcripts or paste notes to get started.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export type { ContextItem };
