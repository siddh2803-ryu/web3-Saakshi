export function isFixtureMode(): boolean {
  return process.env.TINYFISH_MODE === "fixture";
}

export interface TinyFishRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

export async function tinyFishFetch<T = unknown>(
  url: string,
  options: TinyFishRequestOptions = {}
): Promise<T> {
  const apiKey = process.env.TINYFISH_API_KEY;
  const method = options.method || "GET";
  const timeoutMs = options.timeoutMs || 30000;
  const maxRetries = options.retries ?? 1;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
    ...options.headers,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const requestId = response.headers.get("x-request-id") || "none";

      if (!response.ok) {
        const errorText = await response.text();
        const err = new Error(
          `TinyFish API error (${response.status}) at ${url} [reqId: ${requestId}]: ${errorText}`
        );

        // Retry only on 5xx or transient 429
        if (response.status >= 500 && attempt < maxRetries) {
          console.warn(`TinyFish returned ${response.status}, retrying in 2s (attempt ${attempt + 1})...`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        throw err;
      }

      const data = (await response.json()) as T;
      return data;
    } catch (err: unknown) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < maxRetries) {
        console.warn(`TinyFish request to ${url} failed, retrying in 2s:`, err);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  throw lastError;
}
