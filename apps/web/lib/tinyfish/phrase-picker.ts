/**
 * Distinctive Phrase Picker for Repost Discovery (PRD F11.1, FR-11.1, PRD 7.4, 9.1).
 *
 * Uses repost_phrases from Gemini AI analysis when opted into AI and present.
 * Otherwise, applies a deterministic fallback that selects the 1 or 2 most distinctive
 * sentence fragments of 12 words or fewer from the Fetch text, strictly skipping boilerplate,
 * URLs, and numeric/currency-only strings.
 */

const BOILERPLATE_PATTERNS = [
  /cookie/i,
  /privacy policy/i,
  /terms of (use|service)/i,
  /all rights reserved/i,
  /copyright/i,
  /sign in/i,
  /log in/i,
  /subscribe/i,
  /newsletter/i,
  /share this/i,
  /follow us/i,
  /click here/i,
  /read more/i,
  /leave a comment/i,
  /advertisement/i,
  /sponsored/i,
  /skip to (content|main)/i,
  /navigation/i,
  /menu/i,
  /search/i,
  /loading/i,
  /javascript is required/i,
];

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9.-]+\.(com|org|net|io|ai|in|gov|edu)[^\s]*)/i;
const NUMBERS_ONLY_PATTERN = /^[\s\d,.$₹€£¥%+\-:;()#@!/\\|]+$/;

const STOP_WORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
  "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
  "this", "but", "his", "by", "from", "they", "we", "say", "her",
  "she", "or", "an", "will", "my", "one", "all", "would", "there",
  "their", "what", "so", "up", "out", "if", "about", "who", "get",
  "which", "go", "me", "when", "make", "can", "like", "time", "no",
  "just", "him", "know", "take", "people", "into", "year", "your",
  "good", "some", "could", "them", "see", "other", "than", "then",
  "now", "look", "only", "come", "its", "over", "think", "also",
  "back", "after", "use", "two", "how", "our", "work", "first",
  "well", "way", "even", "new", "want", "because", "any", "these",
  "give", "day", "most", "us", "is", "are", "was", "were", "been",
]);

/**
 * Truncates a string to at most maxWords words without breaking words.
 */
export function truncateToWordLimit(text: string, maxWords = 12): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) {
    return text.trim();
  }
  return words.slice(0, maxWords).join(" ").trim();
}

/**
 * Scores a candidate sentence fragment for distinctiveness.
 * Higher score means more informative, specific content words.
 */
function scoreFragment(fragment: string): number {
  const words = fragment.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 3) return -100;

  let score = 0;
  for (const w of words) {
    const cleanWord = w.replace(/[^a-z0-9]/g, "");
    if (!cleanWord) continue;
    if (STOP_WORDS.has(cleanWord)) {
      score += 0.2;
    } else if (cleanWord.length > 5) {
      score += 2.5; // Long informative words
    } else if (cleanWord.length > 3) {
      score += 1.5;
    } else {
      score += 0.8;
    }
  }

  // Bonus for quotes, specific casing, or punctuation indicating a statement
  if (/["'₹$@]/.test(fragment)) {
    score += 3.0;
  }

  // Ideal length between 6 and 12 words
  if (words.length >= 6 && words.length <= 12) {
    score += 4.0;
  } else if (words.length < 5) {
    score -= 2.0;
  }

  return score;
}

/**
 * Deterministically extracts the 1 or 2 most distinctive sentence fragments
 * of 12 words or fewer from Fetch text without requiring AI.
 */
export function extractDistinctiveFragments(text: string, maxPhrases = 2): string[] {
  if (!text || typeof text !== "string") {
    return [];
  }

  // 1. Remove markdown links, images, code blocks, headers
  const cleanedText = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[.*?\]\(.*?\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/>\s+/g, " ")
    .replace(/[*_~]/g, "");

  // 2. Split into candidate clauses or sentences
  const rawSegments = cleanedText.split(/(?:[\r\n]+|[.!?]\s+|;\s+|—\s+)/);

  interface ScoredCandidate {
    phrase: string;
    score: number;
    originalIndex: number;
  }

  const candidates: ScoredCandidate[] = [];

  for (let i = 0; i < rawSegments.length; i++) {
    const raw = rawSegments[i].replace(/\s+/g, " ").trim();
    if (raw.length < 15) continue;

    // Filter out URLs
    if (URL_PATTERN.test(raw)) continue;

    // Filter out numbers/symbols only
    if (NUMBERS_ONLY_PATTERN.test(raw)) continue;

    // Filter out boilerplate
    if (BOILERPLATE_PATTERNS.some((pat) => pat.test(raw))) continue;

    // Sub-segment into comma phrases if too long
    const subClauses = raw.split(/,\s+/);
    for (const clause of subClauses) {
      const trimmedClause = clause.trim();
      if (trimmedClause.length < 15) continue;
      if (URL_PATTERN.test(trimmedClause)) continue;
      if (NUMBERS_ONLY_PATTERN.test(trimmedClause)) continue;
      if (BOILERPLATE_PATTERNS.some((pat) => pat.test(trimmedClause))) continue;

      const words = trimmedClause.split(/\s+/);
      const phrase = words.length > 12 ? words.slice(0, 12).join(" ") : trimmedClause;

      // Final clean: remove leading/trailing punctuation except quotes
      const cleanPhrase = phrase.replace(/^[^\w"']+|[^\w"']+$/g, "").trim();
      if (cleanPhrase.split(/\s+/).length < 3) continue;

      const score = scoreFragment(cleanPhrase);
      if (score > 2) {
        candidates.push({
          phrase: cleanPhrase,
          score,
          originalIndex: i,
        });
      }
    }
  }

  // Sort descending by score, breaking ties by original appearance
  candidates.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

  const selected: string[] = [];
  const selectedLower = new Set<string>();

  for (const cand of candidates) {
    const lower = cand.phrase.toLowerCase();
    // Avoid near-duplicates
    const isOverlapping = Array.from(selectedLower).some(
      (s) => s.includes(lower) || lower.includes(s)
    );
    if (!isOverlapping) {
      selected.push(cand.phrase);
      selectedLower.add(lower);
      if (selected.length >= maxPhrases) break;
    }
  }

  return selected;
}

/**
 * Main phrase picker:
 * 1. If capture opted into AI and has non-empty repost_phrases, returns those (truncated to 12 words).
 * 2. Otherwise falls back deterministically to extracting 1 or 2 distinctive fragments from Fetch text.
 * 3. If Fetch text is unavailable, falls back to observed title (if <= 12 words and not a URL).
 */
export function pickRepostPhrases(
  capture: {
    aiOptIn?: boolean;
    aiAnalysis?: { repost_phrases?: string[] };
    manifest?: { observed?: { title?: string } };
  },
  fetchText?: string | null
): string[] {
  // 1. AI Analysis Opt-In Check (FR-11.1)
  if (capture.aiOptIn && capture.aiAnalysis?.repost_phrases && Array.isArray(capture.aiAnalysis.repost_phrases)) {
    const aiPhrases = capture.aiAnalysis.repost_phrases
      .map((p) => (typeof p === "string" ? truncateToWordLimit(p.replace(/^["']+|["']+$/g, "").trim(), 12) : ""))
      .filter((p) => p.length > 0 && !URL_PATTERN.test(p));

    if (aiPhrases.length > 0) {
      return aiPhrases.slice(0, 2);
    }
  }

  // 2. Deterministic Fallback on Fetch Text (FR-11.1 Fallback)
  if (fetchText && typeof fetchText === "string") {
    const fragments = extractDistinctiveFragments(fetchText, 2);
    if (fragments.length > 0) {
      return fragments;
    }
  }

  // 3. Last Fallback: observed title (if <= 12 words and not a URL)
  const title = capture.manifest?.observed?.title;
  if (title && typeof title === "string" && !URL_PATTERN.test(title)) {
    const cleanTitle = title.trim();
    if (cleanTitle.length > 0) {
      return [truncateToWordLimit(cleanTitle, 12)];
    }
  }

  return [];
}
