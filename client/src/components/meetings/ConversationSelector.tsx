   import { useQuery } from "@tanstack/react-query";
import type { Conversation } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MessageSquare, Check, Loader2 } from "lucide-react";

interface ConversationSelectorProps {
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
}

export function ConversationSelector({
  selectedIds,
  onSelectionChange,
}: ConversationSelectorProps) {
  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const toggleConversation = (id: number) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 text-xs h-8 ${
            selectedIds.length > 0
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : ""
          }`}
          data-testid="button-meetings-picker"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Meetings
          {selectedIds.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-emerald-200 text-emerald-800"
            >
              {selectedIds.length}
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
            Attach meetings as context
          </span>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectionChange([])}
              className="text-[11px] text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-4 px-3">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading meetings…
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-4 text-xs text-slate-500 text-center">
            <p className="mb-1">No meetings imported yet.</p>
            <a
              href="/brain?tab=meetings"
              className="text-emerald-600 hover:text-emerald-700 font-medium underline"
            >
              Go to Brain → Meetings
            </a>
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            <div className="p-1.5 space-y-1">
              {conversations.map((conv) => {
                const isSelected = selectedIds.includes(conv.id);
                return (
                  <button
                    key={conv.id}
                    onClick={() => toggleConversation(conv.id)}
                    className={`w-full flex items-start gap-2 p-2 rounded-md text-left transition-colors text-xs ${
                      isSelected
                        ? "bg-emerald-50 border border-emerald-200"
                        : "hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                    <div
                      className={`mt-0.5 h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center ${
                        isSelected
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-slate-300"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-700 truncate">
                        {conv.title}
                      </p>
                      <p className="text-slate-400 truncate mt-0.5">
                        {conv.summary
                          ? `${conv.summary.substring(0, 60)}...`
                          : `${conv.content.substring(0, 60)}...`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

const PER_ITEM_CHAR_CAP = 30000;
const TOTAL_CONTEXT_CHAR_CAP = 90000;

function capText(
  text: string,
  maxChars: number,
): { result: string; wasTrimmed: boolean } {
  if (text.length <= maxChars) return { result: text, wasTrimmed: false };
  const headSize = Math.floor(maxChars * 0.8);
  const tailSize = maxChars - headSize - 50;
  const omitted = text.length - headSize - Math.max(tailSize, 0);
  const head = text.slice(0, headSize);
  const tail = tailSize > 0 ? text.slice(-tailSize) : "";
  return {
    result: `${head}\n\n…[${omitted.toLocaleString()} chars trimmed]…\n\n${tail}`,
    wasTrimmed: true,
  };
}

export function getConversationContextText(
  conversations: Conversation[],
  selectedIds: number[],
): string {
  const selected = conversations.filter((c) => selectedIds.includes(c.id));
  if (selected.length === 0) return "";

  let totalUsed = 0;
  const parts: string[] = [];

  for (const c of selected) {
    const remaining = TOTAL_CONTEXT_CHAR_CAP - totalUsed;
    if (remaining <= 200) {
      break;
    }
    const itemCap = Math.min(PER_ITEM_CHAR_CAP, remaining);
    const body = c.summary
      ? `Summary: ${c.summary}\n\n${c.content}`
      : c.content;
    const { result } = capText(body, itemCap);
    const entry = `[MEETING: ${c.title}]\n${result}`;
    parts.push(entry);
    totalUsed += entry.length;
  }

  return parts.join("\n\n---\n\n");
}
