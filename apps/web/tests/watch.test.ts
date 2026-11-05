import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { classifyWatchCheck, classifyWatchRun } from "../lib/watch/classify";
import { computeTextDiff, normalizeWatchText, DIFF_TRUNCATION_MARKER, MAX_DIFF_BYTES } from "../lib/watch/diff";
import { computeSha256 } from "../lib/evidence/hash";
import {
  createPageMonitor,
  runMonitorNow,
  getMonitor,
  listMonitors,
  updateMonitor,
  pauseMonitor,
  resumeMonitor,
  changeMonitorSchedule,
  deleteMonitor,
  DEFAULT_MONITOR_PURPOSE,
  DEFAULT_MONITOR_SCHEDULE,
} from "../lib/tinyfish/monitor";

describe("Phase 6: Watch Classifier & Diff Rules (PRD 6 F8, 7.5)", () => {
  // Chirp Sandbox Baseline Post fixture
  const chirpBaselineText = `# Fast-Track Winter Internship Program (Registration Fee Required)
Author: CareerBridge Global (@careerbridge_official)
Published: 2 hours ago
142 likes
18 shares
3 comments

Exclusive 3-month remote engineering internship at Global AI Labs. Guaranteed stipend of ₹45,000/month. Mandatory one-time documentation and portal registration fee of ₹2,499 to be transferred to UPI id: recruit-verify@payu before 5 PM today. Limited to the first 25 applicants only! Apply immediately.

Updated: 2026-10-20T12:00:00Z`;

  const baselineHash = computeSha256(normalizeWatchText(chirpBaselineText));

  // 1. Identical gives NO_CHANGE
  it("identical gives NO_CHANGE", () => {
    const res = classifyWatchCheck([], chirpBaselineText, baselineHash, chirpBaselineText);
    expect(res.type).toBe("NO_CHANGE");
    expect(res.reason).toContain("strictly matches baseline");
  });

  // 2. Likes 142 to 150 only gives NO_CHANGE
  it("likes 142 to 150 only gives NO_CHANGE", () => {
    const likesChangedText = `# Fast-Track Winter Internship Program (Registration Fee Required)
Author: CareerBridge Global (@careerbridge_official)
Published: 2 hours ago
150 likes
18 shares
3 comments

Exclusive 3-month remote engineering internship at Global AI Labs. Guaranteed stipend of ₹45,000/month. Mandatory one-time documentation and portal registration fee of ₹2,499 to be transferred to UPI id: recruit-verify@payu before 5 PM today. Limited to the first 25 applicants only! Apply immediately.

Updated: 2026-10-20T12:00:00Z`;

    const res = classifyWatchCheck([], likesChangedText, baselineHash, chirpBaselineText);
    expect(res.type).toBe("NO_CHANGE");
  });

  // 3. "2 hours ago" to "3 hours ago" only gives NO_CHANGE
  it('"2 hours ago" to "3 hours ago" only gives NO_CHANGE', () => {
    const timeChangedText = `# Fast-Track Winter Internship Program (Registration Fee Required)
Author: CareerBridge Global (@careerbridge_official)
Published: 3 hours ago
142 likes
18 shares
3 comments

Exclusive 3-month remote engineering internship at Global AI Labs. Guaranteed stipend of ₹45,000/month. Mandatory one-time documentation and portal registration fee of ₹2,499 to be transferred to UPI id: recruit-verify@payu before 5 PM today. Limited to the first 25 applicants only! Apply immediately.

Updated: 2026-10-20T12:00:00Z`;

    const res = classifyWatchCheck([], timeChangedText, baselineHash, chirpBaselineText);
    expect(res.type).toBe("NO_CHANGE");
  });

  // 4. Combined counter and relative time variations (just now, 45 minutes ago) give NO_CHANGE
  it("relative times ('45 minutes ago', 'just now') and counter changes alone give NO_CHANGE", () => {
    const justNowText = `# Fast-Track Winter Internship Program (Registration Fee Required)
Author: CareerBridge Global (@careerbridge_official)
Published: just now
310 likes
42 shares
15 comments

Exclusive 3-month remote engineering internship at Global AI Labs. Guaranteed stipend of ₹45,000/month. Mandatory one-time documentation and portal registration fee of ₹2,499 to be transferred to UPI id: recruit-verify@payu before 5 PM today. Limited to the first 25 applicants only! Apply immediately.

Updated: 2026-10-21T09:30:00Z`;

    const res = classifyWatchCheck([], justNowText, baselineHash, chirpBaselineText);
    expect(res.type).toBe("NO_CHANGE");
  });

  // 5. Changed sentence gives EDITED with a diff and word-level change data
  it("changed sentence gives EDITED with a diff and word-level changes", () => {
    const alteredSentenceText = `# Fast-Track Winter Internship Program (Registration Fee Required)
Author: CareerBridge Global (@careerbridge_official)
Published: 2 hours ago
142 likes
18 shares
3 comments

Exclusive 3-month remote engineering internship at Global AI Labs. Guaranteed stipend of ₹60,000/month. Mandatory one-time documentation and portal registration fee of ₹4,999 to be transferred to UPI id: altered-account@hdfc before 5 PM today. Limited to the first 10 applicants only! Apply immediately.

Updated: 2026-10-20T12:00:00Z`;

    const res = classifyWatchCheck([], alteredSentenceText, baselineHash, chirpBaselineText);
    expect(res.type).toBe("EDITED");
    expect(res.diff).toBeDefined();
    expect(res.diff?.hasMeaningfulChange).toBe(true);
    expect(res.diff?.unifiedDiff).toContain("4,999");
    expect(res.diff?.wordChanges).toBeDefined();
    expect(res.diff?.wordChanges.length).toBeGreaterThan(0);
    // Word change tokens should mark additions of altered content
    const addedWord = res.diff?.wordChanges.find(
      (w) => w.added && (w.value.includes("altered") || w.value.includes("60") || w.value.includes("999"))
    );
    expect(addedWord).toBeDefined();
  });

  // 6. 404 error gives DELETED
  it("404 error gives DELETED", () => {
    // 404 via status
    const res1 = classifyWatchCheck(
      [{ url: "https://chirp.local/post", error: "page_not_found", status: 404 }],
      "",
      baselineHash,
      chirpBaselineText
    );
    expect(res1.type).toBe("DELETED");
    expect(res1.reason).toContain("404/410");

    // 410 Gone status
    const res2 = classifyWatchCheck(
      [{ url: "https://chirp.local/post", error: "target_http_error", status: 410 }],
      "",
      baselineHash,
      chirpBaselineText
    );
    expect(res2.type).toBe("DELETED");

    // page_not_found code
    const res3 = classifyWatchCheck(
      [{ code: "page_not_found" }],
      "",
      baselineHash,
      chirpBaselineText
    );
    expect(res3.type).toBe("DELETED");
  });

  // 7. Removal-phrase page gives DELETED
  it("removal-phrase page gives DELETED for all required phrases", () => {
    const phrases = [
      "this post has been removed",
      "content isn't available",
      "page not found",
      "account suspended",
      "this page is no longer available",
    ];

    for (const phrase of phrases) {
      const removedText = `Chirp Notice: We're sorry, ${phrase}.`;
      const res = classifyWatchCheck([], removedText, baselineHash, chirpBaselineText);
      expect(res.type).toBe("DELETED");
      expect(res.reason.toLowerCase()).toContain(phrase);
    }
  });

  // 8. bot_blocked gives BLOCKED (never treated as DELETED)
  it("bot_blocked gives BLOCKED and never treats as deleted", () => {
    // bot_blocked
    const res1 = classifyWatchCheck(
      [{ error: "bot_blocked", message: "Cloudflare challenge detected" }],
      "",
      baselineHash,
      chirpBaselineText
    );
    expect(res1.type).toBe("BLOCKED");
    expect(res1.newContentHash).toBe(baselineHash); // Retains baseline
    expect(res1.diff).toBeNull();

    // login_required
    const res2 = classifyWatchCheck(
      [{ error: "login_required", message: "Redirected to login wall" }],
      "",
      baselineHash,
      chirpBaselineText
    );
    expect(res2.type).toBe("BLOCKED");

    // timeout
    const res3 = classifyWatchCheck(
      [{ code: "timeout", message: "Fetch request timed out after 60s" }],
      "",
      baselineHash,
      chirpBaselineText
    );
    expect(res3.type).toBe("BLOCKED");
  });

  // 9. NFC/NFD and whitespace variants give NO_CHANGE
  it("NFC/NFD and whitespace variants give NO_CHANGE", () => {
    // Unicode text with accents: "Résumé & Café" in NFD (decomposed) vs NFC (composed)
    const composedBase = `# Résumé & Café Review\nAuthentic crêpe and espresso at café.\n142 likes`;
    const decomposedVariant = composedBase.normalize("NFD"); // Decomposed accented chars

    // Also add irregular tabs, mixed spaces, and trailing carriage returns
    const whitespaceVariant = decomposedVariant
      .split("\n")
      .map((l) => `  \t${l}   \t `)
      .join("\r\n") + "\n\n\n";

    const hash = computeSha256(normalizeWatchText(composedBase));

    const res = classifyWatchCheck([], whitespaceVariant, hash, composedBase);
    expect(res.type).toBe("NO_CHANGE");
  });

  // 10. Diff truncation at 20 KB
  it("diff truncation at 20 KB caps output and appends truncation marker", () => {
    // Generate text differences exceeding 30 KB
    const largeOld = "Line in original document that has been removed.\n".repeat(800);
    const largeNew = "Line in altered document that has newly been added.\n".repeat(800);

    const diffResult = computeTextDiff(largeOld, largeNew);
    expect(diffResult.hasMeaningfulChange).toBe(true);
    expect(diffResult.truncated).toBe(true);
    expect(Buffer.byteLength(diffResult.unifiedDiff, "utf8")).toBeLessThanOrEqual(MAX_DIFF_BYTES);
    expect(diffResult.unifiedDiff).toContain(DIFF_TRUNCATION_MARKER.trim());
  });

  // 11. classifyWatchRun with structured monitor run result
  it("classifyWatchRun accepts structured monitor run results", () => {
    const res = classifyWatchRun({
      results: [
        {
          url: "https://chirp.local/sandbox/post/internship-scam-alert",
          text: chirpBaselineText,
        },
      ],
      errors: [],
      lastKnownContentHash: baselineHash,
      previousText: chirpBaselineText,
    });
    expect(res.type).toBe("NO_CHANGE");
  });
});

describe("Phase 6: TinyFish Monitor Client with Mocked HTTP (PRD 7.5, 7.7)", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TINYFISH_MODE = "live";
    process.env.TINYFISH_API_KEY = "test_tf_monitor_key";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.saakshi.gov.in";
    process.env.WEBHOOK_SECRET = "super_secret_webhook_token_987";
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // 1. createPageMonitor sends correct request body
  it("createPageMonitor sends POST to /v1/monitors with correct body and headers", async () => {
    let capturedUrl = "";
    let capturedOptions: RequestInit | undefined;

    const mockCreateResponse = {
      monitor: {
        id: "mon_real_12345",
        name: "saakshi-cap_abc123",
        schedule_cron: DEFAULT_MONITOR_SCHEDULE,
        status: "active",
        type: "fetch",
        webhook_url: "https://app.saakshi.gov.in/api/webhooks/monitor?token=super_secret_webhook_token_987",
        created_at: "2026-11-05T12:00:00Z",
        updated_at: "2026-11-05T12:00:00Z",
        config: {
          url: "https://example.com/target",
          format: "markdown",
          links: false,
          image_links: false,
          ttl: 0,
        },
      },
      run: {
        id: "run_baseline_001",
        is_baseline: true,
        status: "COMPLETED",
        results: [
          {
            url: "https://example.com/target",
            final_url: "https://example.com/target",
            title: "Target Page",
            text: "# Target Page\nContent",
          },
        ],
        errors: [],
      },
    };

    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedOptions = opts;
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "x-request-id": "req-create-mon-001" }),
        text: async () => JSON.stringify(mockCreateResponse),
      };
    });

    const res = await createPageMonitor({
      captureId: "cap_abc123",
      url: "https://example.com/target",
    });

    expect(capturedUrl).toBe("https://agent.tinyfish.ai/v1/monitors");
    expect(capturedOptions?.method).toBe("POST");

    const body = JSON.parse(capturedOptions?.body as string);
    expect(body.type).toBe("fetch");
    expect(body.name).toBe("saakshi-cap_abc123");
    expect(body.config.url).toBe("https://example.com/target");
    expect(body.config.format).toBe("markdown");
    expect(body.schedule_cron).toBe(DEFAULT_MONITOR_SCHEDULE);
    expect(body.purpose).toBe(DEFAULT_MONITOR_PURPOSE);
    expect(body.webhook_url).toBe("https://app.saakshi.gov.in/api/webhooks/monitor?token=super_secret_webhook_token_987");

    expect(res.monitor.id).toBe("mon_real_12345");
    expect(res.run.is_baseline).toBe(true);
  });

  // 2. runMonitorNow sends POST /v1/monitors/{id}/runs and returns run inline
  it("runMonitorNow returns the run inline without firing webhook", async () => {
    let capturedUrl = "";
    let capturedMethod = "";

    const mockRunNowResponse = {
      run: {
        id: "run_inline_777",
        is_baseline: false,
        status: "COMPLETED",
        results: [
          {
            url: "https://example.com/target",
            final_url: "https://example.com/target",
            title: "Target Page",
            text: "# Target Page\nFresh check text",
          },
        ],
        errors: [],
      },
    };

    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedMethod = opts.method || "GET";
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "x-request-id": "req-run-now-001" }),
        text: async () => JSON.stringify(mockRunNowResponse),
      };
    });

    const runResult = await runMonitorNow("mon_real_12345");

    expect(capturedUrl).toBe("https://agent.tinyfish.ai/v1/monitors/mon_real_12345/runs");
    expect(capturedMethod).toBe("POST");
    expect(runResult.id).toBe("run_inline_777");
    expect(runResult.results[0].text).toContain("Fresh check text");
  });

  // 3. getMonitor, listMonitors, updateMonitor, deleteMonitor OpenAPI spec alignment
  it("get, list, update, and delete monitors match OpenAPI spec paths and methods", async () => {
    const mockMonitor = {
      id: "mon_test_456",
      name: "saakshi-cap_999",
      schedule_cron: "0 * * * *",
      status: "active",
      type: "fetch",
      config: { url: "https://example.com" },
    };

    let calledMethod = "";
    let calledUrl = "";

    global.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      calledUrl = url;
      calledMethod = opts.method || "GET";

      if (calledMethod === "GET" && url === "https://agent.tinyfish.ai/v1/monitors/mon_test_456") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-get" }),
          text: async () => JSON.stringify(mockMonitor),
        };
      }
      if (calledMethod === "GET" && url === "https://agent.tinyfish.ai/v1/monitors") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-list" }),
          text: async () => JSON.stringify({ monitors: [mockMonitor] }),
        };
      }
      if (calledMethod === "PATCH") {
        const body = JSON.parse(opts.body as string);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-patch" }),
          text: async () => JSON.stringify({ ...mockMonitor, ...body }),
        };
      }
      if (calledMethod === "DELETE") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-request-id": "req-del" }),
          text: async () => JSON.stringify({ deleted: true, id: "mon_test_456" }),
        };
      }

      throw new Error(`Unexpected call ${calledMethod} ${url}`);
    });

    // GET
    const mon = await getMonitor("mon_test_456");
    expect(calledUrl).toBe("https://agent.tinyfish.ai/v1/monitors/mon_test_456");
    expect(calledMethod).toBe("GET");
    expect(mon.id).toBe("mon_test_456");

    // LIST
    const list = await listMonitors();
    expect(calledUrl).toBe("https://agent.tinyfish.ai/v1/monitors");
    expect(calledMethod).toBe("GET");
    expect(list.length).toBe(1);

    // PAUSE
    const paused = await pauseMonitor("mon_test_456");
    expect(calledMethod).toBe("PATCH");
    expect(paused.status).toBe("paused");

    // RESUME
    const resumed = await resumeMonitor("mon_test_456");
    expect(calledMethod).toBe("PATCH");
    expect(resumed.status).toBe("active");

    // CHANGE SCHEDULE
    const rescheduled = await changeMonitorSchedule("mon_test_456", "0 0 * * *");
    expect(calledMethod).toBe("PATCH");
    expect(rescheduled.schedule_cron).toBe("0 0 * * *");

    // DELETE
    const del = await deleteMonitor("mon_test_456");
    expect(calledMethod).toBe("DELETE");
    expect(del.deleted).toBe(true);
    expect(del.id).toBe("mon_test_456");
  });

  // 4. Token never appears in logs
  it("never logs the webhook URL with its token", async () => {
    const secretToken = "super_secret_unleakable_token_xyz999";
    const webhookWithToken = `https://saakshi.gov.in/api/webhooks/monitor?token=${secretToken}`;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      return {
        ok: false,
        status: 500,
        headers: new Headers({ "x-request-id": "req-token-test" }),
        text: async () => "Internal server error occurred",
      };
    });

    // Make a request to a URL containing the token
    await expect(
      createPageMonitor({
        captureId: "test_cap",
        url: "https://example.com",
        webhookUrl: webhookWithToken,
      })
    ).rejects.toThrow();

    // Check all log and warn outputs: secretToken must NEVER appear!
    const allLogged = [
      ...logSpy.mock.calls.flat().map(String),
      ...warnSpy.mock.calls.flat().map(String),
    ].join(" ");

    expect(allLogged).not.toContain(secretToken);

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // 5. Zod rejecting malformed runs
  it("zod rejects malformed monitor responses", async () => {
    // Malformed run response missing required id field
    const malformedRunResponse = {
      run: {
        // Missing 'id'
        is_baseline: false,
        status: "COMPLETED",
        results: "not an array",
      },
    };

    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "x-request-id": "req-malformed-001" }),
        text: async () => JSON.stringify(malformedRunResponse),
      };
    });

    await expect(runMonitorNow("mon_real_12345")).rejects.toThrow(/malformed/i);
  });
});
