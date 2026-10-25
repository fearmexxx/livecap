import type { CaptionItem, GlossaryEntry } from "./types";

/**
 * Applies custom event glossary terms with Unicode-aware word boundary matching.
 */
export function applyGlossary(text: string, glossary: GlossaryEntry[]): string {
  if (!text || !glossary || glossary.length === 0) return text;
  let result = text;
  for (const entry of glossary) {
    if (!entry.from || !entry.to) continue;
    const escaped = entry.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
    result = result.replace(regex, entry.to);
  }
  return result;
}

const pad = (n: number, z = 2) => String(n).padStart(z, "0");

export function formatSrtTimestamp(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())},${pad(
    d.getUTCMilliseconds(),
    3
  )}`;
}

export function formatVttTimestamp(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(
    d.getUTCMilliseconds(),
    3
  )}`;
}

export function formatTranscriptTxt(
  history: CaptionItem[],
  sessionName: string,
  sessionId: string
): string {
  let content = `VBE Live Caption Studio - Session: ${sessionName} (${sessionId})\n`;
  content += `Total Lines: ${history.length}\n`;
  content += `Copyright (c) 2026 VBE Agency. All rights reserved.\n`;
  content += `=================================================================\n\n`;

  history.forEach((item) => {
    const time = new Date(item.timestamp).toISOString().slice(11, 19);
    const speakerTag = item.speakerName
      ? `[${item.speakerName}${item.speakerRole ? ` - ${item.speakerRole}` : ""}] `
      : "";
    content += `[${time}] ${speakerTag}[${item.sourceLang.toUpperCase()}] ${item.sourceText}\n`;
    content += ` -> (VI) ${item.translatedText}\n\n`;
  });

  return content;
}

export function formatTranscriptSrt(history: CaptionItem[]): string {
  let content = "";
  history.forEach((item, idx) => {
    const startMs = item.timestamp;
    const nextItem = history[idx + 1];
    const endMs =
      nextItem && nextItem.timestamp > startMs && nextItem.timestamp - startMs < 6000
        ? nextItem.timestamp - 100
        : startMs + 3500;
    const speakerPrefix = item.speakerName ? `[${item.speakerName}] ` : "";

    content += `${idx + 1}\n`;
    content += `${formatSrtTimestamp(startMs)} --> ${formatSrtTimestamp(endMs)}\n`;
    content += `${speakerPrefix}${item.translatedText}\n`;
    if (item.sourceText) {
      content += `${item.sourceText}\n`;
    }
    content += `\n`;
  });
  return content;
}

export function formatTranscriptVtt(history: CaptionItem[]): string {
  let content = "WEBVTT\n\n";
  history.forEach((item, idx) => {
    const startMs = item.timestamp;
    const nextItem = history[idx + 1];
    const endMs =
      nextItem && nextItem.timestamp > startMs && nextItem.timestamp - startMs < 6000
        ? nextItem.timestamp - 100
        : startMs + 3500;
    const speakerTag = item.speakerName ? `<v ${item.speakerName}>` : "";

    content += `${idx + 1}\n`;
    content += `${formatVttTimestamp(startMs)} --> ${formatVttTimestamp(endMs)}\n`;
    content += `${speakerTag}${item.translatedText}\n`;
    if (item.sourceText) {
      content += `${item.sourceText}\n`;
    }
    content += `\n`;
  });
  return content;
}

export function formatTranscriptJson(
  history: CaptionItem[],
  sessionName: string,
  sessionId: string
): string {
  return JSON.stringify(
    {
      service: "VBE Live Caption Studio",
      sessionId,
      sessionName,
      exportedAt: new Date().toISOString(),
      totalCaptions: history.length,
      captions: history,
    },
    null,
    2
  );
}
