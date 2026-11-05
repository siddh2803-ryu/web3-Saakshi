import * as JsDiff from "diff";

export interface WordDiffChunk {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface LineDiffResult {
  hasMeaningfulChange: boolean;
  unifiedDiff: string;
  truncated: boolean;
  addedLinesCount: number;
  removedLinesCount: number;
  wordChanges: WordDiffChunk[];
}

export const MAX_DIFF_BYTES = 20 * 1024; // 20 KB cap per PRD / Step 4
export const DIFF_TRUNCATION_MARKER = "\n\n[...diff truncated at 20 KB...]";

/**
 * Normalizes text content for watch comparison:
 * 1. Unicode NFC normalization.
 * 2. Unifies line breaks (\r\n -> \n, \r -> \n).
 * 3. Strips volatile elements:
 *    - Relative times ("2 hours ago", "45 minutes ago", "just now", "3h ago")
 *    - Engagement counters (like/reply/share/view/retweet counts)
 *    - ISO timestamps (e.g. 2026-11-05T23:24:09Z, 2026-10-20)
 *    - "Updated:" footer lines (e.g. "Updated: ...", "Last Updated: ...")
 * 4. Collapses whitespace and empty lines.
 */
export function normalizeWatchText(text: string): string {
  if (!text) return "";

  // 1. Unicode NFC & line breaks
  let s = text.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Strip "Updated:" footer/header lines
  s = s.replace(/^[ \t]*(?:last[ \t]+)?updated[ \t]*:?.*$/gim, "");

  // 3. Strip ISO timestamps
  s = s.replace(/\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g, "");

  // 4. Strip relative times ("2 hours ago", "45 minutes ago", "just now", "10 seconds ago", etc.)
  s = s.replace(/\b\d+\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\s*ago\b/gi, "");
  s = s.replace(/\b\d+\s*(?:s|m|h|d|w|mo|y)\s*ago\b/gi, "");
  s = s.replace(/\bjust now\b/gi, "");

  // 5. Strip like/reply/share/view/retweet counts
  s = s.replace(/\b\d[\d,\.]*[kKmMbB]?\s*(?:likes?|comments?|replies|reply|shares?|views?|retweets?|reposts?)\b/gi, "");
  s = s.replace(/\b(?:likes?|comments?|replies|reply|shares?|views?|retweets?|reposts?)\s*:\s*\d[\d,\.]*[kKmMbB]?\b/gi, "");

  // 6. Clean up trailing "Published:" or "Posted:" that have had their timestamps stripped
  s = s.replace(/^[ \t]*(?:published|posted)\s*:\s*$/gim, "");

  // 7. Collapse whitespace per line and remove lines that became empty or only punctuation
  const lines = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0 && !/^[-•*:\s]+$/.test(line));

  return lines.join("\n");
}

/**
 * Backward compatibility alias for sanitizeVolatileTokens.
 */
export function sanitizeVolatileTokens(text: string): string {
  return normalizeWatchText(text);
}

/**
 * Truncates unified diff string to MAX_DIFF_BYTES (20 KB) with a clear marker.
 */
function truncatePatch(patch: string): { diff: string; truncated: boolean } {
  const byteLength = Buffer.byteLength(patch, "utf8");
  if (byteLength <= MAX_DIFF_BYTES) {
    return { diff: patch, truncated: false };
  }

  const markerBytes = Buffer.byteLength(DIFF_TRUNCATION_MARKER, "utf8");
  const budget = MAX_DIFF_BYTES - markerBytes;
  const buf = Buffer.from(patch, "utf8");
  const sliced = buf.subarray(0, budget).toString("utf8");

  return {
    diff: sliced + DIFF_TRUNCATION_MARKER,
    truncated: true,
  };
}

/**
 * Computes a unified diff between baseline text and freshly fetched text.
 * Capped at 20 KB with jsdiff unified line diff and word-level change tokens for UI highlighting.
 */
export function computeTextDiff(previousText: string, newText: string): LineDiffResult {
  const normPrev = normalizeWatchText(previousText);
  const normNew = normalizeWatchText(newText);

  // Unified line patch
  const rawPatch = JsDiff.createPatch("evidence_content.txt", normPrev, normNew, "previous", "current");
  const { diff: unifiedDiff, truncated } = truncatePatch(rawPatch);

  // Line additions and removals
  const lineParts = JsDiff.diffLines(normPrev, normNew);
  let added = 0;
  let removed = 0;

  for (const part of lineParts) {
    if (part.added) {
      added += (part.value.match(/\n/g) || []).length || 1;
    }
    if (part.removed) {
      removed += (part.value.match(/\n/g) || []).length || 1;
    }
  }

  // Word-level change data for UI highlighting
  let wordChanges: WordDiffChunk[] = [];
  try {
    const rawWords = JsDiff.diffWordsWithSpace(normPrev, normNew);
    // Cap word changes if huge to maintain predictable memory
    wordChanges = rawWords.slice(0, 1500).map((w) => ({
      value: w.value,
      added: w.added,
      removed: w.removed,
    }));
  } catch {
    wordChanges = [];
  }

  const hasMeaningfulChange = added > 0 || removed > 0;

  return {
    hasMeaningfulChange,
    unifiedDiff,
    truncated,
    addedLinesCount: added,
    removedLinesCount: removed,
    wordChanges,
  };
}
