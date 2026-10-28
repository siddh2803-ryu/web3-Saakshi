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

export class TinyFishApiError extends Error {
  status: number;
  requestId: string;
  category: "auth" | "not_found" | "rate_limit" | "server_error" | "client_error" | "network_error";

  constructor(message: string, status: number, requestId = "none") {
    super(message);
    this.name = "TinyFishApiError";
    this.status = status;
    this.requestId = requestId;

    if (status === 401 || status === 403) {
      this.category = "auth";
    } else if (status === 404) {
      this.category = "not_found";
    } else if (status === 429) {
      this.category = "rate_limit";
    } else if (status >= 500) {
      this.category = "server_error";
    } else if (status >= 400) {
      this.category = "client_error";
    } else {
      this.category = "network_error";
    }
  }
}

/**
 * Standard fetch wrapper for TinyFish API endpoints.
 * Handles timeouts, 1 retry on 5xx or network errors, rejects 4xx without retry,
 * logs X-Request-ID, and produces friendly error messages per category (PRD Section 7.7).
 */
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

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (networkErr: unknown) {
      clearTimeout(timer);
      lastError = networkErr;

      // Retry on network errors or timeouts if attempts remain
      if (attempt < maxRetries) {
        console.warn(
          `[TinyFish] Network attempt ${attempt + 1} failed for ${url}, retrying in 1.5s...`,
          networkErr
        );
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw new TinyFishApiError(
        `TinyFish network request failed: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`,
        0,
        "network-failure"
      );
    }

    clearTimeout(timer);
    const requestId = response.headers.get("x-request-id") || "none";

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const status = response.status;

      let friendlyMsg = `TinyFish API error (${status}) at ${url} [reqId: ${requestId}]`;
      if (status === 401 || status === 403) {
        friendlyMsg = `TinyFish authentication/authorization failed (${status}) [reqId: ${requestId}]: ${errorText || "Verify TINYFISH_API_KEY and account permissions"}`;
      } else if (status === 404) {
        friendlyMsg = `TinyFish resource not found (404) at ${url} [reqId: ${requestId}]`;
      } else if (status === 429) {
        friendlyMsg = `TinyFish rate limit exceeded (429) [reqId: ${requestId}]: ${errorText || "Please slow down requests"}`;
      } else if (status >= 500) {
        friendlyMsg = `TinyFish upstream server error (${status}) [reqId: ${requestId}]: ${errorText || "Service temporarily unavailable"}`;
      }

      console.warn(`[TinyFish] [X-Request-ID: ${requestId}] HTTP ${status}: ${friendlyMsg}`);

      // Retry ONLY on 5xx or transient 429
      if ((status >= 500 || status === 429) && attempt < maxRetries) {
        console.warn(`[TinyFish] Retrying ${url} (attempt ${attempt + 1} of ${maxRetries})...`);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

      // 4xx errors (except 429 above) fail immediately without retry
      throw new TinyFishApiError(friendlyMsg, status, requestId);
    }

    const data = (await response.json()) as T;
    return data;
  }

  throw lastError;
}
