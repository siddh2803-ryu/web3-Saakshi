import { computeSha256 } from "@/lib/evidence/hash";
import { computeTextDiff, normalizeWatchText, LineDiffResult } from "./diff";

export type WatchClassificationType = "NO_CHANGE" | "EDITED" | "DELETED" | "BLOCKED";

export interface WatchClassificationResult {
  type: WatchClassificationType;
  newContentHash: string;
  diff: LineDiffResult | null;
  reason: string;
}

export interface MonitorErrorLike {
  url?: string;
  error?: string;
  code?: string;
  message?: string;
  status?: number;
}

export interface MonitorRunResultItemLike {
  text?: string | Record<string, unknown> | null;
  url?: string;
  final_url?: string | null;
  title?: string | null;
  status?: number;
}

export interface ClassifyWatchRunOptions {
  results?: MonitorRunResultItemLike[];
  errors?: MonitorErrorLike[];
  newRawText?: string | Record<string, unknown> | null;
  lastKnownContentHash: string;
  previousText?: string;
}

const DELETION_PHRASES = [
  "this post has been removed",
  "content isn't available",
  "content is not available",
  "page not found",
  "account suspended",
  "this page is no longer available",
  "this content is no longer available",
  "404 not found",
  "post was deleted",
  "tweet has been deleted",
  "something went wrong. this page doesn't exist",
];

/**
 * Classifies a monitor run against the last known baseline content hash.
 * Handles BLOCKED (bot_blocked, login_required, timeout) without marking deleted.
 * Handles DELETED (page_not_found, HTTP 404/410, removal phrases).
 * Strips volatile parts before hashing so counter/timestamp changes alone give NO_CHANGE.
 */
export function classifyWatchRun(options: ClassifyWatchRunOptions): WatchClassificationResult {
  const { errors, lastKnownContentHash, previousText } = options;

  // Extract raw text from options or from results[0]
  let rawText = "";
  if (typeof options.newRawText === "string") {
    rawText = options.newRawText;
  } else if (options.newRawText && typeof options.newRawText === "object") {
    rawText = JSON.stringify(options.newRawText);
  } else if (options.results && options.results.length > 0) {
    const firstResult = options.results[0];
    if (typeof firstResult.text === "string") {
      rawText = firstResult.text;
    } else if (firstResult.text && typeof firstResult.text === "object") {
      rawText = JSON.stringify(firstResult.text);
    }
  }

  // 1. Check for BLOCKED errors first (bot_blocked, login_required, timeout)
  // PRD 7.5: Never treat these as deleted; retry at the next check
  if (errors && errors.length > 0) {
    const isBlocked = errors.some((e) => {
      const err = (e.error || e.code || "").toLowerCase();
      return err === "bot_blocked" || err === "login_required" || err === "timeout";
    });
    if (isBlocked) {
      return {
        type: "BLOCKED",
        newContentHash: lastKnownContentHash, // Retain baseline on block
        diff: null,
        reason: "Access temporarily blocked or challenged (bot_blocked, login_required, or timeout)",
      };
    }

    // 2. Check for DELETED via errors (page_not_found, HTTP 404/410)
    const has404 = errors.some((e) => {
      const err = (e.error || e.code || "").toLowerCase();
      const status = e.status;
      return err === "page_not_found" || status === 404 || status === 410;
    });
    if (has404) {
      const normText = normalizeWatchText(rawText);
      const newHash = normText ? computeSha256(normText) : lastKnownContentHash;
      return {
        type: "DELETED",
        newContentHash: newHash,
        diff: previousText ? computeTextDiff(previousText, "") : null,
        reason: "Page returned 404/410 or page_not_found deletion status",
      };
    }
  }

  // Normalize text before hashing: Unicode NFC, collapse whitespace, strip volatile tokens
  const normText = normalizeWatchText(rawText);
  const newHash = normText ? computeSha256(normText) : lastKnownContentHash;

  // 3. Check for removal phrases in the normalized text
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

  // 4. If normalized content hash strictly matches baseline, NO_CHANGE
  if (newHash === lastKnownContentHash) {
    return {
      type: "NO_CHANGE",
      newContentHash: newHash,
      diff: null,
      reason: "Content hash strictly matches baseline (volatile counters/timestamps stripped)",
    };
  }

  // 5. If hash differs, evaluate line diff to see if main content altered
  if (previousText) {
    const diffResult = computeTextDiff(previousText, rawText);
    if (diffResult.hasMeaningfulChange) {
      return {
        type: "EDITED",
        newContentHash: newHash,
        diff: diffResult,
        reason: `Content altered (${diffResult.addedLinesCount} lines added, ${diffResult.removedLinesCount} lines removed)`,
      };
    } else {
      // Only transient counters/timestamps or whitespace changed
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

/**
 * Backward-compatible helper that accepts parameter list.
 */
export function classifyWatchCheck(
  errors: MonitorErrorLike[] | undefined,
  newRawText: string,
  lastKnownContentHash: string,
  previousText?: string
): WatchClassificationResult {
  return classifyWatchRun({
    errors,
    newRawText,
    lastKnownContentHash,
    previousText,
  });
}
