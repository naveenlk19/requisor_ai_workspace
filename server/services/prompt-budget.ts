const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4": 8192,
  "gpt-3.5-turbo": 16385,
};

const CHARS_PER_TOKEN = 4;
const SAFETY_MARGIN_TOKENS = 2000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function charsForTokens(tokens: number): number {
  return tokens * CHARS_PER_TOKEN;
}

export function getContextWindow(model: string): number {
  return MODEL_CONTEXT_WINDOWS[model] || 128000;
}

export interface TrimResult {
  text: string;
  wasTrimmed: boolean;
  originalChars: number;
  trimmedChars: number;
}

export function trimToCharBudget(
  text: string,
  maxChars: number,
  options?: { headRatio?: number },
): TrimResult {
  if (text.length <= maxChars) {
    return { text, wasTrimmed: false, originalChars: text.length, trimmedChars: 0 };
  }
  const headRatio = options?.headRatio ?? 0.8;
  const markerSpace = 60;
  const usable = maxChars - markerSpace;
  if (usable <= 0) {
    return { text: "", wasTrimmed: true, originalChars: text.length, trimmedChars: text.length };
  }
  const headSize = Math.floor(usable * headRatio);
  const tailSize = usable - headSize;
  const omitted = text.length - headSize - tailSize;
  const head = text.slice(0, headSize);
  const tail = tailSize > 0 ? text.slice(-tailSize) : "";
  const trimmed = `${head}\n\n…[${omitted.toLocaleString()} chars trimmed]…\n\n${tail}`;
  return {
    text: trimmed,
    wasTrimmed: true,
    originalChars: text.length,
    trimmedChars: omitted,
  };
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface TrimReport {
  wasTrimmed: boolean;
  droppedMessages: number;
  trimmedBlocks: number;
  details: string[];
}

export interface FitMessagesOptions {
  model?: string;
  replyTokens?: number;
  perBlockCapChars?: number;
  callSite?: string;
}

export function fitMessages(
  messages: ChatMessage[],
  options?: FitMessagesOptions,
): { messages: ChatMessage[]; trimReport: TrimReport } {
  const model = options?.model || "gpt-4o";
  const replyTokens = options?.replyTokens || 6000;
  const window = getContextWindow(model);
  const hardCapTokens = window - replyTokens - SAFETY_MARGIN_TOKENS;
  const hardCapChars = charsForTokens(hardCapTokens);
  const perBlockCap = options?.perBlockCapChars || charsForTokens(90000);

  const report: TrimReport = {
    wasTrimmed: false,
    droppedMessages: 0,
    trimmedBlocks: 0,
    details: [],
  };

  let result = messages.map((m) => ({ ...m }));

  const totalChars = () => result.reduce((sum, m) => sum + m.content.length, 0);

  if (totalChars() > hardCapChars) {
    const nonSystem: number[] = [];
    let lastUserIdx = result.length - 1;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].role === "user") { lastUserIdx = i; break; }
    }
    for (let i = 0; i < result.length; i++) {
      if (result[i].role !== "system") nonSystem.push(i);
    }
    const droppable = nonSystem.filter((i) => i !== lastUserIdx);

    while (totalChars() > hardCapChars && droppable.length > 0) {
      const idx = droppable.shift()!;
      const dropped = result[idx];
      report.details.push(`Dropped ${dropped.role} message (${dropped.content.length} chars)`);
      report.droppedMessages++;
      result[idx] = { ...dropped, content: "" };
    }
    result = result.filter((m) => m.content.length > 0);
  }

  for (let i = 0; i < result.length; i++) {
    const m = result[i];
    const cap = Math.min(perBlockCap, hardCapChars);
    if (m.content.length > cap) {
      const trimResult = trimToCharBudget(m.content, cap);
      if (trimResult.wasTrimmed) {
        result[i] = { ...m, content: trimResult.text };
        report.trimmedBlocks++;
        report.details.push(
          `Trimmed ${m.role} message: ${trimResult.originalChars.toLocaleString()} → ${trimResult.text.length.toLocaleString()} chars`,
        );
      }
    }
  }

  if (totalChars() > hardCapChars) {
    for (let i = result.length - 1; i >= 0; i--) {
      if (totalChars() <= hardCapChars) break;
      const m = result[i];
      const excess = totalChars() - hardCapChars;
      const targetLen = Math.max(200, m.content.length - excess);
      if (m.content.length > targetLen) {
        const trimResult = trimToCharBudget(m.content, targetLen);
        result[i] = { ...m, content: trimResult.text };
        report.trimmedBlocks++;
        report.details.push(
          `Emergency trim ${m.role} message: ${trimResult.originalChars.toLocaleString()} → ${trimResult.text.length.toLocaleString()} chars`,
        );
      }
    }
  }

  report.wasTrimmed = report.droppedMessages > 0 || report.trimmedBlocks > 0;

  if (report.wasTrimmed) {
    const site = options?.callSite ? ` [${options.callSite}]` : "";
    console.warn(
      `[prompt-budget]${site} Context trimmed for model=${model}: dropped=${report.droppedMessages} msgs, trimmed=${report.trimmedBlocks} blocks. ${report.details.join("; ")}`,
    );
  }

  return { messages: result, trimReport: report };
}

export function splitIntoChunks(text: string, maxCharsPerChunk: number): string[] {
  if (text.length <= maxCharsPerChunk) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerChunk) {
      chunks.push(remaining);
      break;
    }
    let splitPoint = remaining.lastIndexOf("\n\n", maxCharsPerChunk);
    if (splitPoint < maxCharsPerChunk * 0.5) {
      splitPoint = remaining.lastIndexOf("\n", maxCharsPerChunk);
    }
    if (splitPoint < maxCharsPerChunk * 0.5) {
      splitPoint = maxCharsPerChunk;
    }
    chunks.push(remaining.slice(0, splitPoint));
    remaining = remaining.slice(splitPoint).trimStart();
  }
  return chunks;
}
