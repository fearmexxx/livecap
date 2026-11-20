/**
 * The poll feed only sends what a screen does not have yet.
 *
 * - History: the server gives the history a tag. A screen sends back the tag it has (`h=`). When the tag
 *   is the same, no history is sent. When the screen is a few lines behind, only the new lines are sent
 *   (`historyAdd`). Otherwise the whole history is sent.
 * - Config: the event settings (with the glossary) get a version. A screen sends back its version
 *   (`cv=`), and the config is sent only when it changed.
 *
 * Type imports only, so it runs in route handlers, the browser and node tests alike.
 */
import type { CaptionItem } from "./types.ts";

export const MAX_FEED_HISTORY = 100;

/** Tag of a finished line: a line sent again with the same id gets a new tag. */
export function historyTagOf(line: CaptionItem | null | undefined): string {
  return line ? `${line.id}@${line.sentAt || line.timestamp || 0}` : "";
}

/** A screen's history after a poll: the full history, or its own plus the new lines (same id replaces). */
export function applyHistoryUpdate(
  current: CaptionItem[],
  update: { history?: CaptionItem[]; historyAdd?: CaptionItem[] }
): CaptionItem[] {
  if (Array.isArray(update.history)) return update.history;
  if (!Array.isArray(update.historyAdd) || !update.historyAdd.length) return current;
  const byId = new Map<string, CaptionItem>();
  for (const line of current) byId.set(line.id, line);
  for (const line of update.historyAdd) byId.set(line.id, line);
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-MAX_FEED_HISTORY);
}

/** Should the config go out? Unknown versions on either side always send it. */
export function configChanged(clientVersion: string | null | undefined, roomVersion: string): boolean {
  return !clientVersion || !roomVersion || clientVersion !== roomVersion;
}
