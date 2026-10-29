import { isFixtureMode, tinyFishFetch } from "./client";
import { FIXTURE_FETCH_RESULT } from "./fixtures";
import {
  TinyFishFetchResponseSchema,
  TinyFishFetchError,
  FetchMeta,
} from "./schemas";

export interface FetchResult {
  text: string;
  meta: FetchMeta;
  title?: string;
  description?: string;
  author?: string;
  publishedDate?: string;
  language?: string;
  finalUrl?: string;
  links?: string[];
  imageLinks?: string[];
  etag?: string;
  lastModified?: string;
  latencyMs: number;
  errors: TinyFishFetchError[];
  errorCodes: string[];
  errorEvents: string[];
}

/**
 * Maps TinyFish Fetch error codes to clear, human-readable capture events (PRD Section 7.3).
 * Keeps codes available for Phase 6 deletion and change classification.
 */
export function mapFetchErrorToEvent(error: TinyFishFetchError): string {
  switch (error.code) {
    case "page_not_found":
      return `Target page not found (HTTP ${error.status || 404})${error.message ? `: ${error.message}` : ""}`;
    case "bot_blocked":
      return `Access blocked by anti-bot protection or Cloudflare challenge${error.message ? `: ${error.message}` : ""}`;
    case "login_required":
      return `Target content requires authentication / login${error.message ? `: ${error.message}` : ""}`;
    case "timeout":
      return `Fetch request timed out after ${error.message || "per-URL timeout limit"}`;
    default:
      return `Fetch error [${error.code}]${error.status ? ` (HTTP ${error.status})` : ""}${error.message ? `: ${error.message}` : ""}`;
  }
}

/**
 * Extracts clean, token-efficient markdown and metadata via TinyFish Fetch API (PRD Section 7.3).
 * Validates responses using Zod, maps error codes to capture events, and logs X-Request-ID.
 */
export async function fetchCleanText(targetUrl: string): Promise<FetchResult> {
  if (isFixtureMode()) {
    return FIXTURE_FETCH_RESULT;
  }

  // Exact request body matching PRD Section 7.3
  const payload = {
    urls: [targetUrl],
    format: "markdown",
    links: true,
    image_links: true,
    ttl: 0,
    per_url_timeout_ms: 60000,
    include_etag_and_last_modified: true,
  };

  const startTime = Date.now();
  const rawResponse = await tinyFishFetch<unknown>(
    "https://api.fetch.tinyfish.ai",
    {
      method: "POST",
      body: payload,
      timeoutMs: 150000, // 150-second client timeout per PRD 7.3
    }
  );
  const latencyMs = Date.now() - startTime;

  // Validate the response with Zod (results[] and errors[])
  const validated = TinyFishFetchResponseSchema.parse(rawResponse);

  const firstResult = validated.results?.[0];
  const errors = validated.errors || [];
  const errorCodes = errors.map((e) => e.code);
  const errorEvents = errors.map(mapFetchErrorToEvent);

  const meta: FetchMeta = {
    title: firstResult?.title || null,
    description: firstResult?.description || null,
    author: firstResult?.author || null,
    published_date: firstResult?.published_date || null,
    language: firstResult?.language || null,
    final_url: firstResult?.final_url || firstResult?.url || null,
    links: firstResult?.links || [],
    image_links: firstResult?.image_links || [],
    etag: firstResult?.etag || null,
    last_modified: firstResult?.last_modified || null,
    latency_ms: latencyMs,
    errors,
    error_codes: errorCodes,
    error_events: errorEvents,
  };

  return {
    text: firstResult?.text || "",
    meta,
    title: firstResult?.title || undefined,
    description: firstResult?.description || undefined,
    author: firstResult?.author || undefined,
    publishedDate: firstResult?.published_date || undefined,
    language: firstResult?.language || undefined,
    finalUrl: firstResult?.final_url || firstResult?.url || undefined,
    links: firstResult?.links || [],
    imageLinks: firstResult?.image_links || [],
    etag: firstResult?.etag || undefined,
    lastModified: firstResult?.last_modified || undefined,
    latencyMs,
    errors,
    errorCodes,
    errorEvents,
  };
}
