import { isFixtureMode, tinyFishFetch } from "./client";
import { FIXTURE_FETCH_RESULT } from "./fixtures";

export interface FetchResult {
  text: string;
  title?: string;
  description?: string;
  author?: string;
  publishedDate?: string;
  language?: string;
  links?: string[];
  imageLinks?: string[];
  etag?: string;
  lastModified?: string;
  errors?: Array<{ code: string; message?: string; status?: number }>;
}

interface RawFetchResponse {
  results?: Array<{
    url: string;
    text?: string;
    title?: string;
    description?: string;
    author?: string;
    published_date?: string;
    language?: string;
    links?: string[];
    image_links?: string[];
    etag?: string;
    last_modified?: string;
  }>;
  errors?: Array<{
    url?: string;
    code: string;
    message?: string;
    status?: number;
  }>;
}

/**
 * Extracts clean, token-efficient markdown and metadata via TinyFish Fetch API.
 */
export async function fetchCleanText(targetUrl: string): Promise<FetchResult> {
  if (isFixtureMode()) {
    return FIXTURE_FETCH_RESULT;
  }

  const payload = {
    urls: [targetUrl],
    format: "markdown",
    links: true,
    image_links: true,
    ttl: 0,
    per_url_timeout_ms: 60000,
    include_etag_and_last_modified: true,
  };

  const res = await tinyFishFetch<RawFetchResponse>(
    "https://api.fetch.tinyfish.ai",
    {
      method: "POST",
      body: payload,
      timeoutMs: 150000,
    }
  );

  const firstResult = res.results?.[0];
  const errors = res.errors || [];

  return {
    text: firstResult?.text || "",
    title: firstResult?.title,
    description: firstResult?.description,
    author: firstResult?.author,
    publishedDate: firstResult?.published_date,
    language: firstResult?.language,
    links: firstResult?.links,
    imageLinks: firstResult?.image_links,
    etag: firstResult?.etag,
    lastModified: firstResult?.last_modified,
    errors,
  };
}
