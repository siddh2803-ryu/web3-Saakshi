import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  captureWithBrowserApi,
  createBrowserSession,
  terminateBrowserSession,
} from "../lib/tinyfish/browser";
import { TinyFishApiError } from "../lib/tinyfish/client";

// Mock playwright-core
vi.mock("playwright-core", () => {
  return {
    chromium: {
      connectOverCDP: vi.fn(),
    },
  };
});

describe("Phase 2: TinyFish Browser Module (PRD Section 7.2, 7.7)", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TINYFISH_MODE = "live";
    process.env.TINYFISH_API_KEY = "test_tf_browser_key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // Helper to create mock Playwright Page and Browser objects
  function createMockPlaywright(options: {
    failGoto?: boolean;
    failScreenshot?: boolean;
    failPdf?: boolean;
    tlsDetails?: Record<string, unknown> | null;
  } = {}) {
    const callOrder: string[] = [];
    let responseCallback: ((res: any) => Promise<void>) | null = null;

    const mockRequest = {
      method: () => "GET",
      resourceType: () => "document",
      isNavigationRequest: () => true,
      timing: () => ({ responseEnd: 154 }),
    };

    const mockResponse = {
      url: () => "https://example.com",
      status: () => 200,
      request: () => mockRequest,
      headers: () => ({ "content-type": "text/html; charset=utf-8" }),
      timing: () => ({ responseEnd: 154 }),
      securityDetails: async () =>
        options.tlsDetails !== undefined
          ? options.tlsDetails
          : {
              protocol: "TLS 1.3",
              issuer: "DigiCert Global Root G2",
              subjectName: "example.com",
              validFrom: 1700000000,
              validTo: 1750000000,
            },
    };

    const page = {
      on: vi.fn().mockImplementation((event: string, cb: any) => {
        callOrder.push(`on:${event}`);
        if (event === "response") {
          responseCallback = cb;
        }
      }),
      goto: vi.fn().mockImplementation(async (url: string) => {
        callOrder.push("goto");
        if (options.failGoto) {
          throw new Error("Navigation timeout or DNS resolution failure");
        }
        // Trigger response callback to simulate network response during navigation
        if (responseCallback) {
          await responseCallback(mockResponse);
        }
      }),
      waitForLoadState: vi.fn().mockImplementation(async (state: string) => {
        callOrder.push(`waitForLoadState:${state}`);
      }),
      evaluate: vi.fn().mockImplementation(async () => {
        callOrder.push("evaluate");
      }),
      url: vi.fn().mockReturnValue("https://example.com/final"),
      title: vi.fn().mockResolvedValue("Example Domain - Captured"),
      content: vi.fn().mockResolvedValue("<!DOCTYPE html><html><body>Captured DOM</body></html>"),
      screenshot: vi.fn().mockImplementation(async () => {
        callOrder.push("screenshot");
        if (options.failScreenshot) {
          throw new Error("CDP target crashed during screenshot");
        }
        return Buffer.from("mock_png_screenshot_bytes");
      }),
      pdf: vi.fn().mockImplementation(async () => {
        callOrder.push("pdf");
        if (options.failPdf) {
          throw new Error("Page.printToPDF is not supported over this CDP connection");
        }
        return Buffer.from("%PDF-1.4 mock pdf bytes");
      }),
    };

    const context = {
      pages: () => [page],
      newPage: async () => page,
    };

    const browser = {
      contexts: () => [context],
      newContext: async () => context,
      close: vi.fn().mockResolvedValue(undefined),
    };

    return { browser, page, callOrder };
  }

  // 1. Session Created Without URL
  it("creates session without url, with 120s timeout and 60s client timeout", async () => {
    let capturedUrl = "";
    let capturedOptions: RequestInit | undefined;

    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedOptions = opts;
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "x-request-id": "req-browser-create-001" }),
        json: async () => ({
          session_id: "sess_test_123",
          cdp_url: "wss://browser.tinyfish.ai/cdp/sess_test_123",
          base_url: "https://api.browser.tinyfish.ai",
        }),
      };
    });

    const session = await createBrowserSession();

    expect(capturedUrl).toBe("https://api.browser.tinyfish.ai");
    expect(capturedOptions?.method).toBe("POST");

    const body = JSON.parse(capturedOptions?.body as string);
    // Crucial: Body MUST NOT have url, so the page starts at about:blank
    expect(body).toEqual({ timeout_seconds: 120 });
    expect(body.url).toBeUndefined();

    expect(session.session_id).toBe("sess_test_123");
    expect(session.cdp_url).toBe("wss://browser.tinyfish.ai/cdp/sess_test_123");
  });

  // 2. Listeners Attached Before Goto
  it("attaches page.on('response') listeners BEFORE navigating with page.goto()", async () => {
    const { chromium } = await import("playwright-core");
    const { browser, callOrder } = createMockPlaywright();
    (chromium.connectOverCDP as any).mockResolvedValue(browser);

    const deleteFetch = vi.fn();
    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      if (opts.method === "POST") {
        return {
          ok: true,
          status: 201,
          headers: new Headers({ "x-request-id": "req-sess-002" }),
          json: async () => ({
            session_id: "sess_order_test",
            cdp_url: "wss://browser.tinyfish.ai/cdp/secret-session-url",
          }),
        };
      }
      if (opts.method === "DELETE") {
        deleteFetch(url);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-del-002" }),
          json: async () => ({}),
        };
      }
      throw new Error(`Unexpected call: ${opts.method} ${url}`);
    });

    await captureWithBrowserApi("https://example.com");

    const onResponseIdx = callOrder.indexOf("on:response");
    const gotoIdx = callOrder.indexOf("goto");

    expect(onResponseIdx).toBeGreaterThanOrEqual(0);
    expect(gotoIdx).toBeGreaterThanOrEqual(0);
    // Listeners MUST be attached before goto
    expect(onResponseIdx).toBeLessThan(gotoIdx);
  });

  // 3. Guaranteed Termination on Success, Screenshot Failure, and Navigation Failure
  it("terminates browser session on successful capture", async () => {
    const { chromium } = await import("playwright-core");
    const { browser } = createMockPlaywright();
    (chromium.connectOverCDP as any).mockResolvedValue(browser);

    const deleteCalls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      if (opts.method === "POST") {
        return {
          ok: true,
          status: 201,
          headers: new Headers({ "x-request-id": "req-term-001" }),
          json: async () => ({
            session_id: "sess_success_999",
            cdp_url: "wss://browser.tinyfish.ai/cdp/sess_success_999",
          }),
        };
      }
      if (opts.method === "DELETE") {
        deleteCalls.push(url);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-del-term-001" }),
          json: async () => ({}),
        };
      }
      throw new Error(`Unexpected call: ${opts.method} ${url}`);
    });

    const consoleLogSpy = vi.spyOn(console, "log");

    const result = await captureWithBrowserApi("https://example.com");
    expect(result.finalUrl).toBe("https://example.com/final");
    expect(deleteCalls).toEqual(["https://api.browser.tinyfish.ai/sess_success_999"]);
    expect(consoleLogSpy).toHaveBeenCalledWith("browser session sess_success_999 terminated");

    consoleLogSpy.mockRestore();
  });

  it("terminates browser session when screenshot fails", async () => {
    const { chromium } = await import("playwright-core");
    const { browser } = createMockPlaywright({ failScreenshot: true });
    (chromium.connectOverCDP as any).mockResolvedValue(browser);

    const deleteCalls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      if (opts.method === "POST") {
        return {
          ok: true,
          status: 201,
          headers: new Headers({ "x-request-id": "req-shot-err" }),
          json: async () => ({
            session_id: "sess_fail_shot",
            cdp_url: "wss://browser.tinyfish.ai/cdp/sess_fail_shot",
          }),
        };
      }
      if (opts.method === "DELETE") {
        deleteCalls.push(url);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-del-shot-err" }),
          json: async () => ({}),
        };
      }
      throw new Error(`Unexpected call: ${opts.method} ${url}`);
    });

    await expect(captureWithBrowserApi("https://example.com")).rejects.toThrow(
      "CDP target crashed during screenshot"
    );

    // Guaranteed termination MUST happen
    expect(deleteCalls).toEqual(["https://api.browser.tinyfish.ai/sess_fail_shot"]);
  });

  it("terminates browser session when navigation fails", async () => {
    const { chromium } = await import("playwright-core");
    const { browser } = createMockPlaywright({ failGoto: true });
    (chromium.connectOverCDP as any).mockResolvedValue(browser);

    const deleteCalls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      if (opts.method === "POST") {
        return {
          ok: true,
          status: 201,
          headers: new Headers({ "x-request-id": "req-goto-err" }),
          json: async () => ({
            session_id: "sess_fail_goto",
            cdp_url: "wss://browser.tinyfish.ai/cdp/sess_fail_goto",
          }),
        };
      }
      if (opts.method === "DELETE") {
        deleteCalls.push(url);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-del-goto-err" }),
          json: async () => ({}),
        };
      }
      throw new Error(`Unexpected call: ${opts.method} ${url}`);
    });

    await expect(captureWithBrowserApi("https://example.com")).rejects.toThrow(
      "Navigation timeout or DNS resolution failure"
    );

    // Guaranteed termination MUST happen
    expect(deleteCalls).toEqual(["https://api.browser.tinyfish.ai/sess_fail_goto"]);
  });

  // 4. PDF Failure Logs Warning and Capture Continues
  it("logs a warning when PDF fails over CDP and continues capture with null pagePdf", async () => {
    const { chromium } = await import("playwright-core");
    const { browser } = createMockPlaywright({ failPdf: true });
    (chromium.connectOverCDP as any).mockResolvedValue(browser);

    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      if (opts.method === "POST") {
        return {
          ok: true,
          status: 201,
          headers: new Headers({ "x-request-id": "req-pdf-warn" }),
          json: async () => ({
            session_id: "sess_pdf_warn",
            cdp_url: "wss://browser.tinyfish.ai/cdp/sess_pdf_warn",
          }),
        };
      }
      if (opts.method === "DELETE") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-del-pdf-warn" }),
          json: async () => ({}),
        };
      }
      throw new Error(`Unexpected call: ${opts.method} ${url}`);
    });

    const consoleWarnSpy = vi.spyOn(console, "warn");

    const result = await captureWithBrowserApi("https://example.com");

    expect(result.pagePdf).toBeNull();
    expect(result.fullpageScreenshot).toBeInstanceOf(Buffer);
    expect(result.domHtml).toContain("Captured DOM");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("page.pdf threw over CDP, proceeding without PDF artifact"),
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  });

  // 5. Error Handling: 402, 429, and 503
  describe("HTTP Error Handling (402, 429, 503)", () => {
    it("handles 402 wallet empty with 'capture credits exhausted' error", async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 402,
        headers: new Headers({ "x-request-id": "req-402-wallet" }),
        text: async () => "Wallet balance is 0.00",
      }));

      await expect(createBrowserSession()).rejects.toThrow(/Capture credits exhausted/);
    });

    it("handles 429 rate limit honoring Retry-After", async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          return {
            ok: false,
            status: 429,
            headers: new Headers({
              "x-request-id": "req-429-rate",
              "retry-after": "0", // 0 seconds for fast test
            }),
            text: async () => "Rate limit exceeded. Try again in 0s.",
          };
        }
        return {
          ok: true,
          status: 201,
          headers: new Headers({ "x-request-id": "req-201-after-429" }),
          json: async () => ({
            session_id: "sess_429_recovered",
            cdp_url: "wss://browser.tinyfish.ai/cdp/sess_429",
          }),
        };
      });

      const session = await createBrowserSession({ retryDelayMs: 10 });
      expect(attempts).toBe(2);
      expect(session.session_id).toBe("sess_429_recovered");
    });

    it("handles 503 service unavailable by retrying once", async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          return {
            ok: false,
            status: 503,
            headers: new Headers({ "x-request-id": "req-503-unavail" }),
            text: async () => "Service Unavailable - Server Warmup",
          };
        }
        return {
          ok: true,
          status: 201,
          headers: new Headers({ "x-request-id": "req-201-after-503" }),
          json: async () => ({
            session_id: "sess_503_recovered",
            cdp_url: "wss://browser.tinyfish.ai/cdp/sess_503",
          }),
        };
      });

      // Pass small retryDelayMs override for fast test execution
      const session = await createBrowserSession({ retryDelayMs: 10 });
      expect(attempts).toBe(2);
      expect(session.session_id).toBe("sess_503_recovered");
    });
  });

  // 6. Network Log and TLS Info Shapes
  it("records valid network_log and tls_info shapes", async () => {
    const { chromium } = await import("playwright-core");
    const { browser } = createMockPlaywright({
      tlsDetails: {
        protocol: "TLS 1.3",
        issuer: "Let's Encrypt Authority X3",
        subjectName: "example.com",
        validFrom: 1700000000,
        validTo: 1750000000,
      },
    });
    (chromium.connectOverCDP as any).mockResolvedValue(browser);

    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      if (opts.method === "POST") {
        return {
          ok: true,
          status: 201,
          headers: new Headers({ "x-request-id": "req-shape-001" }),
          json: async () => ({
            session_id: "sess_shape_001",
            cdp_url: "wss://browser.tinyfish.ai/cdp/sess_shape_001",
          }),
        };
      }
      if (opts.method === "DELETE") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-del-shape-001" }),
          json: async () => ({}),
        };
      }
      throw new Error(`Unexpected call: ${opts.method} ${url}`);
    });

    const result = await captureWithBrowserApi("https://example.com");

    // Network log entry shape verification
    expect(result.networkLog).toHaveLength(1);
    const net = result.networkLog[0];
    expect(net.url).toBe("https://example.com");
    expect(net.status).toBe(200);
    expect(net.method).toBe("GET");
    expect(net.resourceType).toBe("document");
    expect(net.contentType).toBe("text/html; charset=utf-8");
    expect(typeof net.timing).toBe("number");

    // TLS Info shape verification
    expect(result.tlsInfo).not.toBeNull();
    const tls = result.tlsInfo!;
    expect(tls.protocol).toBe("TLS 1.3");
    expect(tls.issuer).toBe("Let's Encrypt Authority X3");
    expect(tls.subjectName).toBe("example.com");
    expect(tls.validFrom).toBe(1700000000);
    expect(tls.validTo).toBe(1750000000);
  });

  // 7. Security: cdp_url Never Appears in Logs
  it("never logs the cdp_url in console logs, warnings, or errors", async () => {
    const sensitiveCdpUrl = "wss://browser.tinyfish.ai/cdp/SECRET_SENSITIVE_SESSION_TOKEN_12345";
    const { chromium } = await import("playwright-core");
    const { browser } = createMockPlaywright();
    (chromium.connectOverCDP as any).mockResolvedValue(browser);

    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      if (opts.method === "POST") {
        return {
          ok: true,
          status: 201,
          headers: new Headers({ "x-request-id": "req-secret-001" }),
          json: async () => ({
            session_id: "sess_secret_001",
            cdp_url: sensitiveCdpUrl,
          }),
        };
      }
      if (opts.method === "DELETE") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-del-secret-001" }),
          json: async () => ({}),
        };
      }
      throw new Error(`Unexpected call: ${opts.method} ${url}`);
    });

    const allLoggedLines: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      allLoggedLines.push(args.join(" "));
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
      allLoggedLines.push(args.join(" "));
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      allLoggedLines.push(args.join(" "));
    });

    await captureWithBrowserApi("https://example.com");

    const fullLogOutput = allLoggedLines.join("\n");
    expect(fullLogOutput).not.toContain(sensitiveCdpUrl);
    expect(fullLogOutput).not.toContain("SECRET_SENSITIVE_SESSION_TOKEN");
    expect(fullLogOutput).not.toContain("wss://browser.tinyfish.ai");

    // Must still log termination
    expect(fullLogOutput).toContain("browser session sess_secret_001 terminated");

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });
});
