import { isFixtureMode, tinyFishFetch } from "./client";
import { FIXTURE_SEARCH_RESPONSE } from "./fixtures";

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  site_name?: string;
  date?: string;
  position?: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
  total_results?: number;
}

// -------------------------------------------------------------
// Rate Limiter: 30 requests per minute (PRD 7.4)
// -------------------------------------------------------------
const requestTimestamps: number[] = [];
const MAX_REQUESTS_PER_MINUTE = 30;
const WINDOW_DURATION_MS = 60000;

export async function checkOrWaitRateLimit(): Promise<void> {
  const now = Date.now();
  // Evict timestamps older than 60 seconds
  while (requestTimestamps.length > 0 && requestTimestamps[0] <= now - WINDOW_DURATION_MS) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const oldest = requestTimestamps[0];
    const waitTime = oldest + WINDOW_DURATION_MS - now + 50;
    if (waitTime > 0 && waitTime <= 5000) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    } else if (waitTime > 5000) {
      throw new Error("TinyFish Search rate limit reached (30 requests/minute). Please wait a moment.");
    }
  }

  requestTimestamps.push(Date.now());
}

/**
 * Searches the web for exact-phrase reposts or mirrors using TinyFish Search API (PRD 7.4).
 * Query parameters: query=<"exact phrase">, location=IN (fallback to US), language=en.
 * Timeout: 10 seconds. Limit: 30 RPM.
 */
export async function searchReposts(phrase: string): Promise<SearchResponse> {
  if (isFixtureMode()) {
    return FIXTURE_SEARCH_RESPONSE;
  }

  // Exact-phrase matching: strip leading/trailing quotes and re-wrap in double quotes
  const cleanPhrase = phrase.replace(/^["'\s]+|["'\s]+$/g, "").trim();
  if (!cleanPhrase) {
    return { query: '""', results: [] };
  }

  const quotedQuery = `"${cleanPhrase}"`;
  const encodedQuery = encodeURIComponent(quotedQuery);

  // Apply rate limiter
  await checkOrWaitRateLimit();

  const primaryUrl = `https://api.search.tinyfish.ai?query=${encodedQuery}&location=IN&language=en`;
  const timeoutMs = 10000; // 10 seconds timeout per Step 3 / PRD 7.4

  try {
    const res = await tinyFishFetch<{ results?: SearchResultItem[]; total_results?: number }>(primaryUrl, {
      method: "GET",
      timeoutMs,
    });
    return {
      query: quotedQuery,
      results: res.results || [],
      total_results: res.total_results,
    };
  } catch (primaryErr) {
    console.warn("Search with location=IN failed, falling back to location=US:", primaryErr);
    const fallbackUrl = `https://api.search.tinyfish.ai?query=${encodedQuery}&location=US&language=en`;
    try {
      const fallbackRes = await tinyFishFetch<{ results?: SearchResultItem[]; total_results?: number }>(
        fallbackUrl,
        {
          method: "GET",
          timeoutMs,
        }
      );
      return {
        query: quotedQuery,
        results: fallbackRes.results || [],
        total_results: fallbackRes.total_results,
      };
    } catch (fallbackErr) {
      console.error("Search with location=US also failed:", fallbackErr);
      throw fallbackErr;
    }
  }
}
