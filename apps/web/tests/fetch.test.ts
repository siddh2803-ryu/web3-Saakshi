import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchCleanText, mapFetchErrorToEvent } from "../lib/tinyfish/fetch";
import { TinyFishFetchResponseSchema, TinyFishFetchError } from "../lib/tinyfish/schemas";
import { TinyFishApiError, tinyFishFetch } from "../lib/tinyfish/client";

describe("Phase 2: TinyFish Fetch Module (PRD Section 7.3, 7.7)", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TINYFISH_MODE = "live";
    process.env.TINYFISH_API_KEY = "test_tf_fetch_key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // 1. Correct Endpoint, Headers, and Request Body
  it("sends correct endpoint, headers, and body per PRD Section 7.3", async () => {
    let capturedUrl = "";
    let capturedOptions: RequestInit | undefined;

    const mockResponse = {
      results: [
        {
          url: "https://example.com",
          final_url: "https://example.com/canonical",
          title: "Example Title",
          description: "Example Description",
          author: "Jane Doe",
          published_date: "2026-10-29T12:00:00Z",
          language: "en",
          links: ["https://example.com/about"],
          image_links: ["https://example.com/logo.png"],
          etag: '"12345"',
          last_modified: "Wed, 21 Oct 2026 07:28:00 GMT",
          text: "# Example Title\n\nThis is clean markdown text.",
        },
      ],
      errors: [],
    };

    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedOptions = opts;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req-fetch-001" }),
        json: async () => mockResponse,
      };
    });

    const result = await fetchCleanText("https://example.com");

    expect(capturedUrl).toBe("https://api.fetch.tinyfish.ai");
    expect(capturedOptions?.method).toBe("POST");

    const headers = capturedOptions?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-API-Key"]).toBe("test_tf_fetch_key");

    const body = JSON.parse(capturedOptions?.body as string);
    expect(body).toEqual({
      urls: ["https://example.com"],
      format: "markdown",
      links: true,
      image_links: true,
      ttl: 0,
      per_url_timeout_ms: 60000,
      include_etag_and_last_modified: true,
    });

    // Validates extracted result structure
    expect(result.text).toBe("# Example Title\n\nThis is clean markdown text.");
    expect(result.meta.title).toBe("Example Title");
    expect(result.meta.description).toBe("Example Description");
    expect(result.meta.author).toBe("Jane Doe");
    expect(result.meta.published_date).toBe("2026-10-29T12:00:00Z");
    expect(result.meta.language).toBe("en");
    expect(result.meta.final_url).toBe("https://example.com/canonical");
    expect(result.meta.links).toEqual(["https://example.com/about"]);
    expect(result.meta.image_links).toEqual(["https://example.com/logo.png"]);
    expect(result.meta.etag).toBe('"12345"');
    expect(result.meta.last_modified).toBe("Wed, 21 Oct 2026 07:28:00 GMT");
    expect(result.meta.latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.errors).toEqual([]);
  });

  // 2. Zod Rejects Malformed Responses
  it("zod rejects malformed API responses", async () => {
    // Malformed: results is a string instead of an array
    const malformedResponse = {
      results: "not an array",
      errors: [],
    };

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "x-request-id": "req-malformed-001" }),
      json: async () => malformedResponse,
    }));

    await expect(fetchCleanText("https://example.com")).rejects.toThrow();

    // Direct schema validation test
    expect(() =>
      TinyFishFetchResponseSchema.parse({
        results: [{ text: 12345 }], // text must be string
      })
    ).toThrow();
  });

  // 3. Error Code Mapping to Clear Capture Events
  it("maps each error code to the right capture event and keeps codes available", async () => {
    const testCases: Array<{ error: TinyFishFetchError; expectedSubstring: string | RegExp }> = [
      {
        error: { code: "page_not_found", status: 404, message: "Resource not found" },
        expectedSubstring: /Target page not found \(HTTP 404\)/,
      },
      {
        error: { code: "bot_blocked", message: "Cloudflare challenge presented" },
        expectedSubstring: /Access blocked by anti-bot protection/,
      },
      {
        error: { code: "login_required", message: "Paywall / subscription gate" },
        expectedSubstring: /Target content requires authentication \/ login/,
      },
      {
        error: { code: "timeout", message: "Timed out waiting for upstream server" },
        expectedSubstring: /Fetch request timed out after/,
      },
      {
        error: { code: "dns_resolution_failure", status: 500, message: "NXDOMAIN" },
        expectedSubstring: /Fetch error \[dns_resolution_failure\] \(HTTP 500\)/,
      },
    ];

    for (const { error, expectedSubstring } of testCases) {
      const eventMessage = mapFetchErrorToEvent(error);
      expect(eventMessage).toMatch(expectedSubstring);
    }

    // Verify error codes and events are saved on FetchResult and FetchMeta
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "x-request-id": "req-err-001" }),
      json: async () => ({
        results: [],
        errors: [
          { code: "page_not_found", status: 404, message: "Page has been removed" },
          { code: "timeout", message: "Operation timed out" },
        ],
      }),
    }));

    const res = await fetchCleanText("https://example.com/deleted");
    expect(res.errorCodes).toEqual(["page_not_found", "timeout"]);
    expect(res.errorEvents).toHaveLength(2);
    expect(res.errorEvents[0]).toContain("Target page not found (HTTP 404)");
    expect(res.errorEvents[1]).toContain("Fetch request timed out");
    expect(res.meta.error_codes).toEqual(["page_not_found", "timeout"]);
  });

  // 4. Retry on 5xx and Network Errors, None on 4xx (PRD Section 7.7)
  it("retries on 5xx server error with backoff and succeeds on 2nd attempt", async () => {
    let attempts = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        return {
          ok: false,
          status: 502,
          headers: new Headers({ "x-request-id": "req-502-retry" }),
          text: async () => "Bad Gateway",
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req-200-ok" }),
        json: async () => ({
          results: [{ text: "# Success After Retry" }],
          errors: [],
        }),
      };
    });

    const res = await fetchCleanText("https://example.com");
    expect(attempts).toBe(2);
    expect(res.text).toBe("# Success After Retry");
  });

  it("does NOT retry on 4xx client errors (fails immediately)", async () => {
    let attempts = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      attempts++;
      return {
        ok: false,
        status: 400,
        headers: new Headers({ "x-request-id": "req-400-bad" }),
        text: async () => "Invalid URL parameter",
      };
    });

    await expect(fetchCleanText("https://example.com")).rejects.toThrow(/Invalid URL parameter/);
    expect(attempts).toBe(1);
  });
});
