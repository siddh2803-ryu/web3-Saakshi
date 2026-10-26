import { isFixtureMode, tinyFishFetch } from "./client";
import { FIXTURE_SEARCH_RESPONSE } from "./fixtures";

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
}

/**
 * Searches the web for exact-phrase reposts or mirrors using TinyFish Search API.
 */
export async function searchReposts(phrase: string): Promise<SearchResponse> {
  if (isFixtureMode()) {
    return FIXTURE_SEARCH_RESPONSE;
  }

  const cleanPhrase = phrase.replace(/"/g, "").trim();
  const queryParam = encodeURIComponent(`"${cleanPhrase}"`);

  try {
    const url = `https://api.search.tinyfish.ai?query=${queryParam}&location=IN&language=en`;
    const res = await tinyFishFetch<{ results: SearchResultItem[] }>(url, {
      method: "GET",
      timeoutMs: 25000,
    });
    return {
      query: `"${cleanPhrase}"`,
      results: res.results || [],
    };
  } catch (err) {
    console.warn("Search with location=IN failed, falling back to location=US:", err);
    const fallbackUrl = `https://api.search.tinyfish.ai?query=${queryParam}&location=US&language=en`;
    const fallbackRes = await tinyFishFetch<{ results: SearchResultItem[] }>(fallbackUrl, {
      method: "GET",
      timeoutMs: 25000,
    });
    return {
      query: `"${cleanPhrase}"`,
      results: fallbackRes.results || [],
    };
  }
}
