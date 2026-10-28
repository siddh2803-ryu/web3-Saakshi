import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateCaptureUrl, isPrivateOrLocalhostHost } from "../lib/validation/url";
import {
  isRunBlockedOrPartial,
  startAgentRun,
  getAgentRun,
} from "../lib/tinyfish/agent";
import {
  AgentRunResultSchema,
  AgentRunResponseSchema,
  NewCaptureRequestSchema,
} from "../lib/tinyfish/schemas";
import { buildAgentGoal, GOAL_TEMPLATE } from "../lib/tinyfish/prompts";
import { tinyFishFetch, TinyFishApiError } from "../lib/tinyfish/client";
import { POST as webhookHandler } from "../app/api/webhooks/tinyfish/route";
import { POST as capturePostHandler, GET as captureGetHandler } from "../app/api/captures/route";
import { NextRequest } from "next/server";
import { saveCaptureRecord } from "../lib/firebase/admin";

describe("Phase 1: Agent & Capture Hardening Test Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. URL VALIDATOR TESTS
  // =========================================================================
  describe("URL Validator (FR-2.3)", () => {
    it("accepts valid public HTTP and HTTPS URLs", () => {
      const httpsResult = validateCaptureUrl("https://example.com/post/12345");
      expect(httpsResult.valid).toBe(true);
      expect(httpsResult.normalizedUrl).toBe("https://example.com/post/12345");

      const httpResult = validateCaptureUrl("http://my-blog.org/article");
      expect(httpResult.valid).toBe(true);
      expect(httpResult.normalizedUrl).toBe("http://my-blog.org/article");
    });

    it("rejects localhost hostnames", () => {
      expect(validateCaptureUrl("http://localhost").valid).toBe(false);
      expect(validateCaptureUrl("http://localhost:3000").valid).toBe(false);
      expect(validateCaptureUrl("https://localhost/dashboard").valid).toBe(false);
      expect(validateCaptureUrl("http://app.localhost").valid).toBe(false);
      expect(validateCaptureUrl("http://server.local").valid).toBe(false);
      expect(validateCaptureUrl("http://internal.service.internal").valid).toBe(false);
    });

    it("rejects 127.0.0.1 and loopback IPv4/IPv6", () => {
      expect(validateCaptureUrl("http://127.0.0.1").valid).toBe(false);
      expect(validateCaptureUrl("http://127.0.0.1:8080/path").valid).toBe(false);
      expect(validateCaptureUrl("http://127.0.1.5").valid).toBe(false);
      expect(validateCaptureUrl("http://0.0.0.0").valid).toBe(false);
      expect(validateCaptureUrl("http://[::1]").valid).toBe(false);
    });

    it("rejects 10.x.x.x private IP range", () => {
      expect(validateCaptureUrl("http://10.0.0.1").valid).toBe(false);
      expect(validateCaptureUrl("http://10.255.255.255:80").valid).toBe(false);
    });

    it("rejects 172.16.x.x to 172.31.x.x private IP range", () => {
      expect(validateCaptureUrl("http://172.16.0.1").valid).toBe(false);
      expect(validateCaptureUrl("http://172.24.10.5").valid).toBe(false);
      expect(validateCaptureUrl("http://172.31.255.255").valid).toBe(false);
      // Valid public 172.x outside 16-31 should be allowed
      expect(validateCaptureUrl("http://172.32.0.1").valid).toBe(true);
      expect(validateCaptureUrl("http://172.15.0.1").valid).toBe(true);
    });

    it("rejects 192.168.x.x private IP range", () => {
      expect(validateCaptureUrl("http://192.168.0.1").valid).toBe(false);
      expect(validateCaptureUrl("http://192.168.1.100:8000").valid).toBe(false);
    });

    it("rejects 169.254.x.x link-local range", () => {
      expect(validateCaptureUrl("http://169.254.169.254").valid).toBe(false);
      expect(validateCaptureUrl("http://169.254.1.1").valid).toBe(false);
    });

    it("rejects non-HTTP protocols (file:, javascript:, ftp:, data:)", () => {
      expect(validateCaptureUrl("file:///etc/passwd").valid).toBe(false);
      expect(validateCaptureUrl("javascript:alert(1)").valid).toBe(false);
      expect(validateCaptureUrl("ftp://files.example.com").valid).toBe(false);
      expect(validateCaptureUrl("data:text/html,<h1>Hello</h1>").valid).toBe(false);
    });

    it("allows relative /sandbox/ URL when allowSandboxPath is enabled", () => {
      const result = validateCaptureUrl("/sandbox/post/internship-scam-alert", {
        allowSandboxPath: true,
        appBaseUrl: "https://saakshi.app",
      });
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe("https://saakshi.app/sandbox/post/internship-scam-alert");
    });
  });

  // =========================================================================
  // 2. BLOCKED / SOFT-FAILURE DETECTION TESTS
  // =========================================================================
  describe("Blocked / Soft-Failure Detection (FR-3.5)", () => {
    it("detects blocked=true flag from agent result", () => {
      const check = isRunBlockedOrPartial({
        blocked: true,
        block_reason: "Access denied by site policy",
        media: [],
        comments: [],
      });
      expect(check.isBlocked).toBe(true);
      expect(check.reason).toContain("Access denied by site policy");
    });

    it("detects obstacle keywords in content or title (captcha, blocked, access denied, login required)", () => {
      // Captcha keyword
      expect(
        isRunBlockedOrPartial({
          blocked: false,
          content_text: "Please complete the captcha below to proceed.",
          media: [],
          comments: [],
        }).isBlocked
      ).toBe(true);

      // Blocked keyword
      expect(
        isRunBlockedOrPartial({
          blocked: false,
          content_text: "You have been blocked from accessing this server.",
          media: [],
          comments: [],
        }).isBlocked
      ).toBe(true);

      // Access denied
      expect(
        isRunBlockedOrPartial({
          blocked: false,
          page_title: "403 Access Denied",
          media: [],
          comments: [],
        }).isBlocked
      ).toBe(true);

      // Login required
      expect(
        isRunBlockedOrPartial({
          blocked: false,
          content_text: "Account sign-in or login required to view full post.",
          media: [],
          comments: [],
        }).isBlocked
      ).toBe(true);
    });

    it("returns isBlocked=false for clean, accessible content", () => {
      const cleanCheck = isRunBlockedOrPartial({
        blocked: false,
        page_title: "Campus Discussion Post",
        content_text: "A genuine public post with community replies.",
        media: [{ type: "image", url: "https://example.com/pic.jpg" }],
        comments: [{ author: "Alice", text: "Looks great!" }],
      });
      expect(cleanCheck.isBlocked).toBe(false);
      expect(cleanCheck.reason).toBeNull();
    });
  });

  // =========================================================================
  // 3. AGENT RESULT VALIDATION AGAINST OUTPUT SCHEMA
  // =========================================================================
  describe("Agent Output Schema Validation (PRD Section 7.1)", () => {
    it("validates a fully-formed valid agent result", () => {
      const validResult = {
        page_title: "Internship Scam Alert",
        platform: "Chirp",
        author_name: "CareerBridge",
        author_handle: "@careerbridge",
        author_profile_url: "https://chirp.local/u/careerbridge",
        published_at_text: "1 hour ago",
        content_text: "Pay 2499 registration fee to recruit@upi",
        media: [{ type: "image", url: "https://example.com/banner.png" }],
        engagement: {
          likes: "42",
          comments: "2",
          shares: "5",
          views: "300",
        },
        comments: [
          { author: "Pooja", text: "Is this verified?", time_text: "10m ago" },
        ],
        blocked: false,
        block_reason: null,
      };

      const parseResult = AgentRunResultSchema.safeParse(validResult);
      expect(parseResult.success).toBe(true);
    });

    it("accepts a result where blocked=true with block_reason", () => {
      const blockedResult = {
        blocked: true,
        block_reason: "Cloudflare verification challenge presented",
        media: [],
        comments: [],
      };

      const parseResult = AgentRunResultSchema.safeParse(blockedResult);
      expect(parseResult.success).toBe(true);
    });

    it("rejects result missing required fields (blocked, media, comments)", () => {
      // Missing blocked
      expect(
        AgentRunResultSchema.safeParse({
          media: [],
          comments: [],
        }).success
      ).toBe(false);

      // Missing media
      expect(
        AgentRunResultSchema.safeParse({
          blocked: false,
          comments: [],
        }).success
      ).toBe(false);

      // Missing comments
      expect(
        AgentRunResultSchema.safeParse({
          blocked: false,
          media: [],
        }).success
      ).toBe(false);
    });

    it("rejects comment items that lack the required text field", () => {
      const invalidCommentsResult = {
        blocked: false,
        media: [],
        comments: [{ author: "Nobody" }], // missing text
      };
      expect(AgentRunResultSchema.safeParse(invalidCommentsResult).success).toBe(false);
    });
  });

  // =========================================================================
  // 4. GOAL TEMPLATE RENDERING TESTS
  // =========================================================================
  describe("Goal Template Rendering (PRD Section 7.1)", () => {
    it("renders standard mode with COMMENT_LIMIT 20 and STEP_BUDGET 15", () => {
      const goal = buildAgentGoal("Record the scam post and payment details", "standard");
      expect(goal).toContain("Finish within 15 actions.");
      expect(goal).toContain("about 20 comments are visible");
      expect(goal).toContain("User focus: Record the scam post and payment details");
    });

    it("renders deep mode with COMMENT_LIMIT 60 and STEP_BUDGET 30", () => {
      const goal = buildAgentGoal("Preserve comprehensive discussion thread", "deep");
      expect(goal).toContain("Finish within 30 actions.");
      expect(goal).toContain("about 60 comments are visible");
      expect(goal).toContain("User focus: Preserve comprehensive discussion thread");
    });

    it("falls back to default focus when userGoal is not supplied", () => {
      const goal = buildAgentGoal(undefined, "standard");
      expect(goal).toContain("User focus: Capture the full post, author details, and comments.");
    });
  });

  // =========================================================================
  // 5. WEBHOOK SECRET CHECK TESTS
  // =========================================================================
  describe("Webhook Secret Verification (/api/webhooks/tinyfish)", () => {
    beforeEach(() => {
      process.env.WEBHOOK_SECRET = "super_secret_webhook_token_123";
      process.env.TINYFISH_MODE = "fixture";
    });

    it("rejects webhook request with missing token (401)", async () => {
      const req = new NextRequest("http://localhost:3000/api/webhooks/tinyfish?captureId=cap_123", {
        method: "POST",
        body: JSON.stringify({ run_id: "run_test_001" }),
      });
      const res = await webhookHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Invalid or missing webhook secret");
    });

    it("rejects webhook request with invalid token (401)", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/webhooks/tinyfish?token=wrong_token&captureId=cap_123",
        {
          method: "POST",
          body: JSON.stringify({ run_id: "run_test_001" }),
        }
      );
      const res = await webhookHandler(req);
      expect(res.status).toBe(401);
    });

    it("accepts valid token and processes run status", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/webhooks/tinyfish?token=super_secret_webhook_token_123&captureId=cap_123",
        {
          method: "POST",
          body: JSON.stringify({ run_id: "run_fixture_tinyfish_001" }),
        }
      );
      const res = await webhookHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
    });
  });

  // =========================================================================
  // 6. AGENT CLIENT & RETRY TESTS
  // =========================================================================
  describe("Agent Client & HTTP Error Handling (Section 7.1, 7.7)", () => {
    it("startAgentRun sends correct endpoint, headers, and body", async () => {
      delete process.env.TINYFISH_MODE;
      process.env.TINYFISH_API_KEY = "test_key_live";
      delete process.env.TINYFISH_AGENT_BETA;
      delete process.env.TINYFISH_CAPTURE_CONFIG;

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req-123" }),
        json: async () => ({ run_id: "run_live_xyz" }),
      });
      global.fetch = fetchMock;

      const result = await startAgentRun({
        url: "https://example.com/target",
        userGoal: "Capture page",
        mode: "standard",
        webhookUrl: "https://saakshi.app/api/webhooks/tinyfish?token=sec",
      });

      expect(result.run_id).toBe("run_live_xyz");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [calledUrl, calledOptions] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe("https://agent.tinyfish.ai/v1/automation/run-async");
      expect(calledOptions.headers["X-API-Key"]).toBe("test_key_live");
      expect(calledOptions.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(calledOptions.body);
      expect(body.url).toBe("https://example.com/target");
      expect(body.browser_profile).toBe("stealth");
      expect(body.webhook_url).toBe("https://saakshi.app/api/webhooks/tinyfish?token=sec");
      // beta properties omitted when flag is not set
      expect(body.agent_config).toBeUndefined();
      expect(body.capture_config).toBeUndefined();
    });

    it("sends beta fields only when TINYFISH_AGENT_BETA=true", async () => {
      delete process.env.TINYFISH_MODE;
      process.env.TINYFISH_API_KEY = "test_key_live";
      process.env.TINYFISH_AGENT_BETA = "true";

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req-456" }),
        json: async () => ({ run_id: "run_beta_123" }),
      });
      global.fetch = fetchMock;

      await startAgentRun({
        url: "https://example.com/target",
        mode: "deep",
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.agent_config).toBeDefined();
      expect(body.agent_config.mode).toBe("strict");
      expect(body.agent_config.max_steps).toBe(30);
    });

    it("sends capture_config only when TINYFISH_CAPTURE_CONFIG=true", async () => {
      delete process.env.TINYFISH_MODE;
      process.env.TINYFISH_API_KEY = "test_key_live";
      process.env.TINYFISH_CAPTURE_CONFIG = "true";

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req-789" }),
        json: async () => ({ run_id: "run_cap_123" }),
      });
      global.fetch = fetchMock;

      await startAgentRun({
        url: "https://example.com/target",
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.capture_config).toBeDefined();
      expect(body.capture_config.recording).toBe(true);
      expect(body.capture_config.html).toBe(true);
    });

    it("retries on 5xx server error and succeeds on 2nd attempt", async () => {
      process.env.TINYFISH_API_KEY = "test_key";
      let attempts = 0;

      const fetchMock = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          return {
            ok: false,
            status: 502,
            headers: new Headers({ "x-request-id": "req-502" }),
            text: async () => "Bad Gateway",
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-200" }),
          json: async () => ({ data: "success_after_retry" }),
        };
      });
      global.fetch = fetchMock;

      const data = await tinyFishFetch<{ data: string }>("https://agent.tinyfish.ai/v1/test", {
        retries: 1,
      });

      expect(attempts).toBe(2);
      expect(data.data).toBe("success_after_retry");
    });

    it("does NOT retry on 4xx client errors (fails immediately)", async () => {
      process.env.TINYFISH_API_KEY = "test_key";
      let attempts = 0;

      const fetchMock = vi.fn().mockImplementation(async () => {
        attempts++;
        return {
          ok: false,
          status: 403,
          headers: new Headers({ "x-request-id": "req-403" }),
          text: async () => "Forbidden: Account lacks permission",
        };
      });
      global.fetch = fetchMock;

      await expect(
        tinyFishFetch("https://agent.tinyfish.ai/v1/test", { retries: 1 })
      ).rejects.toThrow(/Forbidden/);

      // Must fail immediately on attempt 1 without retry
      expect(attempts).toBe(1);
    });
  });

  // =========================================================================
  // 7. QUOTA ENFORCEMENT & CONSENT TESTS
  // =========================================================================
  describe("Quota Enforcement and Statutory Consent (FR-2.2, FR-2.4)", () => {
    beforeEach(() => {
      process.env.TINYFISH_MODE = "fixture";
      process.env.DAILY_FREE_CAPTURES = "2"; // set small limit for test
    });

    it("rejects capture submission if consent is missing or false (400)", async () => {
      const req = new NextRequest("http://localhost:3000/api/captures", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/post/1",
          consent: false,
        }),
      });

      const res = await capturePostHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("consent");
    });

    it("enforces daily quota and rejects when quota is exhausted (429)", async () => {
      const uid = `test_quota_user_${Date.now()}`;

      // Submit capture 1
      const req1 = new NextRequest("http://localhost:3000/api/captures", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/post/1",
          consent: true,
          uid,
        }),
      });
      const res1 = await capturePostHandler(req1);
      expect(res1.status).toBe(200);

      // Submit capture 2
      const req2 = new NextRequest("http://localhost:3000/api/captures", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/post/2",
          consent: true,
          uid,
        }),
      });
      const res2 = await capturePostHandler(req2);
      expect(res2.status).toBe(200);

      // Submit capture 3 (exceeds quota of 2)
      const req3 = new NextRequest("http://localhost:3000/api/captures", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/post/3",
          consent: true,
          uid,
        }),
      });
      const res3 = await capturePostHandler(req3);
      expect(res3.status).toBe(429);
      const data3 = await res3.json();
      expect(data3.error).toContain("quota exceeded");
    });

    it("respects CAPTURE_ENABLED kill switch (503)", async () => {
      process.env.CAPTURE_ENABLED = "false";
      const req = new NextRequest("http://localhost:3000/api/captures", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/post/1",
          consent: true,
        }),
      });
      const res = await capturePostHandler(req);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toContain("disabled for maintenance");
    });
  });
});
