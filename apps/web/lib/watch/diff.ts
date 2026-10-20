import * as JsDiff from "diff";

export interface LineDiffResult {
  hasMeaningfulChange: boolean;
  unifiedDiff: string;
  addedLinesCount: number;
  removedLinesCount: number;
}

/**
 * Strips transient volatile patterns such as timestamps ("2 hours ago", "5 min ago")
 * and interaction counters ("142 likes", "28 shares") before semantic diffing.
 */
export function sanitizeVolatileTokens(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      // Remove lines that are purely counters or relative times
      if (/^\s*(\d+\s*(likes?|comments?|shares?|views?|retweets?)|(\d+\s*(min|mins|hours?|days?|seconds?|sec)\s*ago))\s*$/i.test(line)) {
        return "";
      }
      return line;
    })
    .join("\n");
}

/**
 * Computes a unified diff between baseline text and freshly fetched text.
 */
export function computeTextDiff(previousText: string, newText: string): LineDiffResult {
  const sanitizedPrev = sanitizeVolatileTokens(previousText);
  const sanitizedNew = sanitizeVolatileTokens(newText);

  const patch = JsDiff.createPatch("evidence_content.txt", sanitizedPrev, sanitizedNew, "previous", "current");
  const diffParts = JsDiff.diffLines(sanitizedPrev, sanitizedNew);

  let added = 0;
  let removed = 0;

  for (const part of diffParts) {
    if (part.added) {
      added += (part.value.match(/\n/g) || []).length || 1;
    }
    if (part.removed) {
      removed += (part.value.match(/\n/g) || []).length || 1;
    }
  }

  // Meaningful change if at least one non-volatile line was added or removed
  const hasMeaningfulChange = added > 0 || removed > 0;

  return {
    hasMeaningfulChange,
    unifiedDiff: patch,
    addedLinesCount: added,
    removedLinesCount: removed,
  };
}
