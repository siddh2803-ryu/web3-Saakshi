export function isFixtureMode(): boolean {
  return process.env.TINYFISH_MODE === "fixture";
}

export interface TinyFishRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  retryOnRateLimit?: boolean;
}

export class TinyFishApiError extends Error {
  status: number;
  requestId: string;
  category: "auth" | "not_found" | "rate_limit" | "wallet_empty" | "server_error" | "client_error" | "network_error";
  retryAfter?: number;
  isCreditsExhausted?: boolean;

  constructor(message: string, status: number, requestId = "none", retryAfter?: number) {
    super(message);
    this.name = "TinyFishApiError";
    this.status = status;
    this.requestId = requestId;
    this.retryAfter = retryAfter;

    if (status === 401 || status === 403) {
      this.category = "auth";
    } else if (status === 402) {
      this.category = "wallet_empty";
      this.isCreditsExhausted = true;
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
 * Handles timeouts, 1 retry on 5xx or network errors with 2-second backoff, rejects 4xx without retry,
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
        cache: "no-store",
      });
    } catch (networkErr: unknown) {
      clearTimeout(timer);
      lastError = networkErr;

      // Retry on network errors or timeouts if attempts remain
      if (attempt < maxRetries) {
        const backoff = options.retryDelayMs ?? 2000;
        console.warn(
          `[TinyFish] Network attempt ${attempt + 1} failed for ${url}, retrying in ${(backoff / 1000).toFixed(1)}s...`,
          networkErr
        );
        await new Promise((r) => setTimeout(r, backoff));
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

      let retryAfterSeconds: number | undefined;
      const retryAfterHeader = response.headers.get("retry-after");
      if (retryAfterHeader) {
        const parsed = parseInt(retryAfterHeader, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          retryAfterSeconds = parsed;
        } else {
          const parsedDate = Date.parse(retryAfterHeader);
          if (!isNaN(parsedDate)) {
            retryAfterSeconds = Math.max(0, Math.ceil((parsedDate - Date.now()) / 1000));
          }
        }
      }

      let friendlyMsg = `TinyFish API error (${status}) at ${url} [reqId: ${requestId}]${errorText ? `: ${errorText}` : ""}`;
      if (status === 401 || status === 403) {
        friendlyMsg = `TinyFish authentication/authorization failed (${status}) [reqId: ${requestId}]: ${errorText || "Verify TINYFISH_API_KEY and account permissions"}`;
      } else if (status === 402) {
        friendlyMsg = `Capture credits exhausted: TinyFish wallet empty (402) [reqId: ${requestId}]: ${errorText || "Add funds or upgrade plan"}`;
      } else if (status === 404) {
        friendlyMsg = `TinyFish resource not found (404) at ${url} [reqId: ${requestId}]${errorText ? `: ${errorText}` : ""}`;
      } else if (status === 429) {
        friendlyMsg = `TinyFish rate limit exceeded (429) [reqId: ${requestId}]: ${errorText || "Please slow down requests"}${retryAfterSeconds !== undefined ? ` (Retry-After: ${retryAfterSeconds}s)` : ""}`;
      } else if (status === 503) {
        friendlyMsg = `TinyFish service unavailable (503) [reqId: ${requestId}]: ${errorText || "Service temporarily overloaded"}`;
      } else if (status >= 500) {
        friendlyMsg = `TinyFish upstream server error (${status}) [reqId: ${requestId}]: ${errorText || "Service temporarily unavailable"}`;
      }

      console.warn(`[TinyFish] [X-Request-ID: ${requestId}] HTTP ${status}: ${friendlyMsg}`);

      // 503 retries once after 5 seconds per PRD 7.2 / 7.7
      if (status === 503 && attempt < maxRetries) {
        const backoff = options.retryDelayMs ?? 5000;
        console.warn(`[TinyFish] Retrying ${url} after 503 (attempt ${attempt + 1} of ${maxRetries}, backoff ${backoff}ms)...`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      // Other 5xx retries once after 2-second backoff per PRD 7.7
      if (status >= 500 && attempt < maxRetries) {
        const backoff = options.retryDelayMs ?? 2000;
        console.warn(`[TinyFish] Retrying ${url} after HTTP ${status} (attempt ${attempt + 1} of ${maxRetries}, backoff ${backoff}ms)...`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      // 429 honors Retry-After when retryOnRateLimit is true
      if (status === 429 && options.retryOnRateLimit && attempt < maxRetries) {
        const backoff = options.retryDelayMs ?? (retryAfterSeconds ? retryAfterSeconds * 1000 : 2000);
        console.warn(`[TinyFish] Retrying ${url} after 429 (attempt ${attempt + 1} of ${maxRetries}, backoff ${backoff}ms honoring Retry-After)...`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      // 4xx errors fail immediately without retry (per PRD 7.7: "no retry on 4xx")
      throw new TinyFishApiError(friendlyMsg, status, requestId, retryAfterSeconds);
    }

    console.log(`[TinyFish] [X-Request-ID: ${requestId}] ${method} ${url} -> HTTP ${response.status}`);
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return {} as T;
    }
    if (typeof response.text === "function") {
      const text = await response.text();
      if (!text || !text.trim()) {
        return {} as T;
      }
      return JSON.parse(text) as T;
    }
    return (await response.json()) as T;
  }

  throw lastError;
}
