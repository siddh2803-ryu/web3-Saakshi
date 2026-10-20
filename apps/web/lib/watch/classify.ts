import { computeSha256 } from "@/lib/evidence/hash";
import { normalizeText } from "@/lib/evidence/normalize";
import { computeTextDiff, LineDiffResult } from "./diff";

export type WatchClassificationType = "NO_CHANGE" | "EDITED" | "DELETED" | "BLOCKED";

export interface WatchClassificationResult {
  type: WatchClassificationType;
  newContentHash: string;
  diff: LineDiffResult | null;
  reason: string;
}

const DELETION_PHRASES = [
  "this post has been removed",
  "content isn't available",
  "content is not available",
  "page not found",
  "404 not found",
  "account suspended",
  "this content is no longer available",
  "post was deleted",
  "tweet has been deleted",
  "something went wrong. this page doesn't exist",
];

export function classifyWatchCheck(
  errors: Array<{ code: string; message?: string; status?: number }> | undefined,
  newRawText: string,
  lastKnownContentHash: string,
  previousText?: string
): WatchClassificationResult {
  const normText = normalizeText(newRawText);
  const newHash = computeSha256(normText);

  // 1. Check for DELETED via HTTP status or error codes
  if (errors && errors.length > 0) {
    const has404 = errors.some(
      (e) => e.code === "page_not_found" || e.status === 404 || e.status === 410
    );
    if (has404) {
      return {
        type: "DELETED",
        newContentHash: newHash,
        diff: previousText ? computeTextDiff(previousText, "") : null,
        reason: "Page returned 404/410 HTTP deletion status",
      };
    }

    // 2. Check for BLOCKED
    const isBlocked = errors.some(
      (e) => e.code === "bot_blocked" || e.code === "login_required" || e.code === "timeout"
    );
    if (isBlocked) {
      return {
        type: "BLOCKED",
        newContentHash: lastKnownContentHash, // retain baseline on block
        diff: null,
        reason: "Access temporarily blocked or challenged (bot detection/login required)",
      };
    }
  }

  // Check normalized text against removal phrases
  const lowerText = normText.toLowerCase();
  for (const phrase of DELETION_PHRASES) {
    if (lowerText.includes(phrase)) {
      return {
        type: "DELETED",
        newContentHash: newHash,
        diff: previousText ? computeTextDiff(previousText, "") : null,
        reason: `Matched removal indicator phrase: "${phrase}"`,
      };
    }
  }

  // 3. Check for EDITED vs NO_CHANGE
  if (newHash === lastKnownContentHash) {
    return {
      type: "NO_CHANGE",
      newContentHash: newHash,
      diff: null,
      reason: "Content hash strictly matches baseline",
    };
  }

  // Hash differs, evaluate if semantic content changed (ignoring volatile counters)
  if (previousText) {
    const diffResult = computeTextDiff(previousText, newRawText);
    if (diffResult.hasMeaningfulChange) {
      return {
        type: "EDITED",
        newContentHash: newHash,
        diff: diffResult,
        reason: `Content altered (${diffResult.addedLinesCount} lines added, ${diffResult.removedLinesCount} lines removed)`,
      };
    } else {
      // Only transient counters/timestamps changed
      return {
        type: "NO_CHANGE",
        newContentHash: newHash,
        diff: diffResult,
        reason: "Only volatile timestamps or engagement counters updated",
      };
    }
  }

  return {
    type: "EDITED",
    newContentHash: newHash,
    diff: null,
    reason: "Content hash differs from baseline",
  };
}
