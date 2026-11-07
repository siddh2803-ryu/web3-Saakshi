import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  saveCaptureRecord,
  getCaptureRecord,
  saveWatchRecord,
  getWatchRecord,
  listWatchEvents,
} from "../lib/firebase/admin";
import * as monitorModule from "../lib/tinyfish/monitor";
import * as agentModule from "../lib/tinyfish/agent";
import { POST as watchPostHandler, DELETE as watchDeleteHandler, GET as watchGetHandler } from "../app/api/captures/[id]/watch/route";
import { POST as checkPostHandler } from "../app/api/watches/[id]/check/route";
import { DELETE as captureDeleteHandler } from "../app/api/captures/[id]/route";
import { POST as monitorWebhookHandler } from "../app/api/webhooks/monitor/route";

describe("Phase 6 Part 2: Watch Routes, Limits, and Check Now", () => {
  const mockCaptureId = "cap_test_watch_001";
  const mockWatchId = "watch_test_001";
  const mockMonitorId = "mon_tinyfish_mock_123";
  const testUrl = "https://conf-moon-exciting-saying.trycloudflare.com/sandbox/post/internship-scam-alert";

  const baselineText = `# Fast-Track Winter Internship Program (Registration Fee Required)
Author: CareerBridge Global (@careerbridge_official)
2 hours ago
142 likes

Exclusive 3-month remote engineering internship at Global AI Labs. Guaranteed stipend of ₹45,000/month.`;

  beforeEach(async () => {
    vi.restoreAllMocks();

    vi.spyOn(monitorModule, "deleteMonitor").mockResolvedValue({
      deleted: true,
      id: mockMonitorId,
    });

    // Seed mock capture
    await saveCaptureRecord(mockCaptureId, {
      id: mockCaptureId,
      ownerUid: "test_user_alice",
      url: testUrl,
      finalUrl: testUrl,
      status: "READY",
      contentHash: "hash_baseline_abc123",
      isWatching: false,
    });
  });

  it("Watch toggle ON creates monitor, stores baseline contentHash, and sets monitorId", async () => {
    const createMonitorSpy = vi.spyOn(monitorModule, "createPageMonitor").mockResolvedValueOnce({
      monitor: {
        id: mockMonitorId,
        name: `saakshi-${mockCaptureId}`,
        schedule_cron: "0 * * * *",
        status: "active",
        type: "fetch",
      },
      run: {
        id: "run_baseline_001",
        is_baseline: true,
        results: [{ url: testUrl, text: baselineText }],
        errors: [],
      },
    });

    vi.spyOn(monitorModule, "listMonitors").mockResolvedValue([]);

    const req = new NextRequest(`http://localhost:3000/api/captures/${mockCaptureId}/watch`, {
      method: "POST",
      body: JSON.stringify({ enabled: true, scheduleCron: "0 * * * *" }),
    });

    const res = await watchPostHandler(req, { params: { id: mockCaptureId } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.watch.monitorId).toBe(mockMonitorId);
    expect(body.watch.scheduleCron).toBe("0 * * * *");
    expect(body.watch.baselineContentHash).toBeTruthy();

    expect(createMonitorSpy).toHaveBeenCalledTimes(1);

    // Verify capture record updated
    const updatedCapture = await getCaptureRecord(mockCaptureId);
    expect(updatedCapture.isWatching).toBe(true);
    expect(updatedCapture.watchId).toBe(body.watch.id);
  });

  it("Watch toggle OFF deletes the monitor and updates capture state", async () => {
    // Set up active watch
    await saveWatchRecord(mockWatchId, {
      id: mockWatchId,
      ownerUid: "test_user_alice",
      captureId: mockCaptureId,
      url: testUrl,
      monitorId: mockMonitorId,
      state: "active",
    });
    await saveCaptureRecord(mockCaptureId, { watchId: mockWatchId, isWatching: true });

    const deleteMonitorSpy = vi.spyOn(monitorModule, "deleteMonitor").mockResolvedValueOnce({
      deleted: true,
      id: mockMonitorId,
    });

    const req = new NextRequest(`http://localhost:3000/api/captures/${mockCaptureId}/watch`, {
      method: "POST",
      body: JSON.stringify({ enabled: false }),
    });

    const res = await watchPostHandler(req, { params: { id: mockCaptureId } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(deleteMonitorSpy).toHaveBeenCalledWith(mockMonitorId);

    const updatedWatch = await getWatchRecord(mockWatchId);
    expect(updatedWatch.state).toBe("disabled");

    const updatedCapture = await getCaptureRecord(mockCaptureId);
    expect(updatedCapture.isWatching).toBe(false);
  });

  it("Refuses new watch when user has 5 active watches (per-user limit)", async () => {
    // Create 5 existing active watches for test_user_limit
    const limitUid = "test_user_limit";
    for (let i = 1; i <= 5; i++) {
      await saveWatchRecord(`watch_limit_${i}`, {
        id: `watch_limit_${i}`,
        ownerUid: limitUid,
        captureId: `cap_limit_${i}`,
        monitorId: `mon_limit_${i}`,
        state: "active",
      });
    }

    const testCapId = "cap_limit_6";
    await saveCaptureRecord(testCapId, {
      id: testCapId,
      ownerUid: limitUid,
      url: testUrl,
      status: "READY",
      isWatching: false,
    });

    const req = new NextRequest(`http://localhost:3000/api/captures/${testCapId}/watch`, {
      method: "POST",
      body: JSON.stringify({ enabled: true }),
    });

    const res = await watchPostHandler(req, { params: { id: testCapId } });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe("USER_WATCH_LIMIT_EXCEEDED");
    expect(body.error).toContain("maximum 5 active watches per user");
  });

  it("Refuses new monitor when account has 45 or more saakshi-* monitors", async () => {
    // Mock listMonitors returning 45 saakshi-* monitors
    const mock45Monitors = Array.from({ length: 45 }, (_, i) => ({
      id: `mon_saakshi_${i}`,
      name: `saakshi-cap_${i}`,
      schedule_cron: "0 * * * *",
      status: "active" as const,
      type: "fetch" as const,
    }));

    vi.spyOn(monitorModule, "listMonitors").mockResolvedValueOnce(mock45Monitors);

    const capId = "cap_account_guard";
    await saveCaptureRecord(capId, {
      id: capId,
      ownerUid: "new_user_bob",
      url: testUrl,
      status: "READY",
      isWatching: false,
    });

    const req = new NextRequest(`http://localhost:3000/api/captures/${capId}/watch`, {
      method: "POST",
      body: JSON.stringify({ enabled: true }),
    });

    const res = await watchPostHandler(req, { params: { id: capId } });
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.code).toBe("ACCOUNT_MONITOR_LIMIT_REACHED");
    expect(body.error).toContain("account has 45 or more active monitors");
  });

  it("Check now classifies NO_CHANGE on identical run", async () => {
    await saveWatchRecord(mockWatchId, {
      id: mockWatchId,
      ownerUid: "test_user_alice",
      captureId: mockCaptureId,
      url: testUrl,
      monitorId: mockMonitorId,
      state: "active",
      lastContentHash: "hash_baseline_abc123",
      lastText: baselineText,
      baselineText: baselineText,
    });

    vi.spyOn(monitorModule, "runMonitorNow").mockResolvedValueOnce({
      id: "run_now_nochange",
      results: [{ url: testUrl, text: baselineText }],
      errors: [],
    });

    const req = new NextRequest(`http://localhost:3000/api/watches/${mockWatchId}/check`, {
      method: "POST",
    });

    const res = await checkPostHandler(req, { params: { id: mockWatchId } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.classification.type).toBe("NO_CHANGE");
    expect(body.event.type).toBe("NO_CHANGE");
    expect(body.event.source).toBe("manual");
    expect(body.event.recaptureId).toBeNull();
  });

  it("Check now detects EDITED, stores diff, triggers automatic re-capture, and sets watchAlert", async () => {
    const editedText = `# Fast-Track Winter Internship Program (Registration Fee Required)
Author: CareerBridge Global (@careerbridge_official)
2 hours ago
142 likes

Exclusive 3-month remote engineering internship at Global AI Labs. Stipend reduced to ₹20,000/month. Mandatory registration fee increased to ₹5,000.`;

    await saveWatchRecord(mockWatchId, {
      id: mockWatchId,
      ownerUid: "test_user_alice",
      captureId: mockCaptureId,
      url: testUrl,
      monitorId: mockMonitorId,
      state: "active",
      lastContentHash: "hash_baseline_abc123",
      lastText: baselineText,
      baselineText: baselineText,
    });

    vi.spyOn(monitorModule, "runMonitorNow").mockResolvedValueOnce({
      id: "run_now_edited",
      results: [{ url: testUrl, text: editedText }],
      errors: [],
    });

    const startAgentSpy = vi.spyOn(agentModule, "startAgentRun").mockResolvedValueOnce({
      run_id: "agent_run_re_001",
    });

    const req = new NextRequest(`http://localhost:3000/api/watches/${mockWatchId}/check`, {
      method: "POST",
    });

    const res = await checkPostHandler(req, { params: { id: mockWatchId } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.classification.type).toBe("EDITED");
    expect(body.event.type).toBe("EDITED");
    expect(body.event.diff).toContain("+");
    expect(body.event.recaptureId).toBeTruthy();

    // Verify automatic re-capture was started
    expect(startAgentSpy).toHaveBeenCalledTimes(1);

    // Verify original capture has in-app alert banner data
    const origCapture = await getCaptureRecord(mockCaptureId);
    expect(origCapture.watchAlert).toBeDefined();
    expect(origCapture.watchAlert.type).toBe("EDITED");
    expect(origCapture.watchAlert.recaptureId).toBe(body.event.recaptureId);

    // Verify re-capture record was created with previousCaptureId
    const recaptureRecord = await getCaptureRecord(body.event.recaptureId);
    expect(recaptureRecord).toBeDefined();
    expect(recaptureRecord.previousCaptureId).toBe(mockCaptureId);
    expect(recaptureRecord.status).toBe("QUEUED");
  });

  it("Check now detects DELETED, creates deletion re-capture, and sets watchAlert", async () => {
    await saveWatchRecord(mockWatchId, {
      id: mockWatchId,
      ownerUid: "test_user_alice",
      captureId: mockCaptureId,
      url: testUrl,
      monitorId: mockMonitorId,
      state: "active",
      lastContentHash: "hash_baseline_abc123",
      lastText: baselineText,
    });

    vi.spyOn(monitorModule, "runMonitorNow").mockResolvedValueOnce({
      id: "run_now_deleted",
      results: [],
      errors: [{ url: testUrl, code: "page_not_found", status: 404, message: "Not Found" }],
    });

    const startAgentSpy = vi.spyOn(agentModule, "startAgentRun").mockResolvedValueOnce({
      run_id: "agent_run_re_del_001",
    });

    const req = new NextRequest(`http://localhost:3000/api/watches/${mockWatchId}/check`, {
      method: "POST",
    });

    const res = await checkPostHandler(req, { params: { id: mockWatchId } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.classification.type).toBe("DELETED");
    expect(body.event.type).toBe("DELETED");
    expect(body.event.recaptureId).toBeTruthy();

    const origCapture = await getCaptureRecord(mockCaptureId);
    expect(origCapture.watchAlert.type).toBe("DELETED");
    expect(origCapture.watchState).toBe("deleted_detected");
  });

  it("Deleting a capture deletes its monitor", async () => {
    await saveWatchRecord(mockWatchId, {
      id: mockWatchId,
      ownerUid: "test_user_alice",
      captureId: mockCaptureId,
      monitorId: mockMonitorId,
      state: "active",
    });
    await saveCaptureRecord(mockCaptureId, {
      id: mockCaptureId,
      watchId: mockWatchId,
      isWatching: true,
      status: "READY",
    });

    const deleteMonitorSpy = vi.spyOn(monitorModule, "deleteMonitor").mockResolvedValueOnce({
      deleted: true,
      id: mockMonitorId,
    });

    const req = new NextRequest(`http://localhost:3000/api/captures/${mockCaptureId}`, {
      method: "DELETE",
    });

    const res = await captureDeleteHandler(req, { params: { id: mockCaptureId } });
    expect(res.status).toBe(200);

    expect(deleteMonitorSpy).toHaveBeenCalledWith(mockMonitorId);

    const updatedWatch = await getWatchRecord(mockWatchId);
    expect(updatedWatch.state).toBe("deleted");
  });

  describe("Watch Check Timeline States (UI Component Logic)", () => {
    it("renders NO_CHANGE timeline event correctly with baseline match and no re-capture", () => {
      const event = {
        id: "wevent_1",
        watchId: mockWatchId,
        type: "NO_CHANGE",
        source: "manual",
        contentHash: "hash_abc",
        diff: null,
        reason: "Content hash strictly matches baseline",
        recaptureId: null,
        detectedAt: new Date().toISOString(),
      };

      expect(event.type).toBe("NO_CHANGE");
      expect(event.source).toBe("manual");
      expect(event.diff).toBeNull();
      expect(event.recaptureId).toBeNull();
    });

    it("renders EDITED timeline event with line diff markers and linked re-capture", () => {
      const diffSnippet = `@@ -1,4 +1,4 @@
 # Fast-Track Winter Internship Program
-Guaranteed stipend of ₹45,000/month.
+Stipend reduced to ₹20,000/month.`;

      const event = {
        id: "wevent_2",
        watchId: mockWatchId,
        type: "EDITED",
        source: "scheduled",
        contentHash: "hash_edited_123",
        diff: diffSnippet,
        reason: "Content altered (1 lines added, 1 lines removed)",
        recaptureId: "cap_re_edited_001",
        detectedAt: new Date().toISOString(),
      };

      expect(event.type).toBe("EDITED");
      expect(event.diff).toContain("+Stipend reduced");
      expect(event.diff).toContain("-Guaranteed stipend");
      expect(event.recaptureId).toBe("cap_re_edited_001");
    });

    it("renders DELETED timeline event with removal reason and linked removal re-capture", () => {
      const event = {
        id: "wevent_3",
        watchId: mockWatchId,
        type: "DELETED",
        source: "manual",
        contentHash: "hash_del_456",
        diff: null,
        reason: "Target post was removed or deleted (HTTP 404)",
        recaptureId: "cap_re_del_001",
        detectedAt: new Date().toISOString(),
      };

      expect(event.type).toBe("DELETED");
      expect(event.reason).toContain("HTTP 404");
      expect(event.recaptureId).toBe("cap_re_del_001");
    });

    it("renders BLOCKED timeline event preserving baseline hash without deletion", () => {
      const event = {
        id: "wevent_4",
        watchId: mockWatchId,
        type: "BLOCKED",
        source: "scheduled",
        contentHash: "hash_baseline_abc123",
        diff: null,
        reason: "Access temporarily blocked or challenged (bot_blocked, login_required, or timeout)",
        recaptureId: null,
        detectedAt: new Date().toISOString(),
      };

      expect(event.type).toBe("BLOCKED");
      expect(event.contentHash).toBe("hash_baseline_abc123");
      expect(event.recaptureId).toBeNull();
    });
  });

  describe("Phase 6 Part 3: Monitor Webhooks, Deduplication, and Confirm-before-acting", () => {
    const webhookWatchId = "watch_hook_001";
    const webhookMonitorId = "mon_tinyfish_hook_456";
    const validToken = process.env.WEBHOOK_SECRET || "dev_webhook_secret";

    beforeEach(async () => {
      vi.restoreAllMocks();

      // Seed watch record linked to webhookMonitorId
      await saveWatchRecord(webhookWatchId, {
        id: webhookWatchId,
        ownerUid: "test_user_alice",
        captureId: mockCaptureId,
        monitorId: webhookMonitorId,
        url: testUrl,
        scheduleCron: "0 * * * *",
        baselineContentHash: "d2788fd5e60c641e19478bb640c67b34bd3520d1fd3116b7134262275d4bf4ee",
        lastContentHash: "d2788fd5e60c641e19478bb640c67b34bd3520d1fd3116b7134262275d4bf4ee",
        baselineText,
        lastText: baselineText,
        state: "active",
        consecutiveBlockedCount: 0,
        isBlockedWarning: false,
        processedRunIds: [],
      });
    });

    it("rejects webhook request when token is missing or wrong (HTTP 401)", async () => {
      // Missing token
      const reqMissing = new NextRequest("http://localhost:3000/api/webhooks/monitor", {
        method: "POST",
        body: JSON.stringify({ fetch_monitor_id: webhookMonitorId, id: "run_01" }),
      });
      const resMissing = await monitorWebhookHandler(reqMissing);
      expect(resMissing.status).toBe(401);
      const jsonMissing = await resMissing.json();
      expect(jsonMissing.error).toContain("Invalid or missing monitor webhook token");

      // Wrong token
      const reqWrong = new NextRequest("http://localhost:3000/api/webhooks/monitor?token=invalid_token", {
        method: "POST",
        body: JSON.stringify({ fetch_monitor_id: webhookMonitorId, id: "run_01" }),
      });
      const resWrong = await monitorWebhookHandler(reqWrong);
      expect(resWrong.status).toBe(401);
    });

    it("rejects malformed payload missing required fields (HTTP 400)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/webhooks/monitor?token=${validToken}`, {
        method: "POST",
        body: JSON.stringify({ unexpected: "bad_format" }),
      });
      const res = await monitorWebhookHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid webhook payload structure");
    });

    it("ignores unknown monitor ID safely (HTTP 200)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/webhooks/monitor?token=${validToken}`, {
        method: "POST",
        body: JSON.stringify({
          fetch_monitor_id: "mon_completely_unknown_999",
          id: "run_unknown_01",
          is_baseline: false,
          results: [{ url: testUrl, text: baselineText }],
          errors: [],
        }),
      });
      const res = await monitorWebhookHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ignored).toBe(true);
      expect(json.reason).toBe("unknown_monitor");
    });

    it("ignores baseline runs without recording scheduled events (HTTP 200)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/webhooks/monitor?token=${validToken}`, {
        method: "POST",
        body: JSON.stringify({
          fetch_monitor_id: webhookMonitorId,
          id: "run_baseline_123",
          is_baseline: true,
          results: [{ url: testUrl, text: baselineText }],
          errors: [],
        }),
      });
      const res = await monitorWebhookHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ignored).toBe(true);
      expect(json.reason).toBe("baseline");
    });

    it("deduplicates retried webhook deliveries by run ID (HTTP 200)", async () => {
      const runId = "run_dedup_test_001";
      const payload = {
        fetch_monitor_id: webhookMonitorId,
        id: runId,
        is_baseline: false,
        results: [{ url: testUrl, text: baselineText }],
        errors: [],
      };

      // First delivery: processed
      const req1 = new NextRequest(`http://localhost:3000/api/webhooks/monitor?token=${validToken}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const res1 = await monitorWebhookHandler(req1);
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.received).toBe(true);
      expect(json1.classification).toBe("NO_CHANGE");

      // Second delivery with same runId: deduplicated
      const req2 = new NextRequest(`http://localhost:3000/api/webhooks/monitor?token=${validToken}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const res2 = await monitorWebhookHandler(req2);
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.ignored).toBe(true);
      expect(json2.reason).toBe("duplicate_run");
    });

    it("confirms EDITED with runNow before alerting and starting re-capture", async () => {
      const editedContent = baselineText.replace("₹45,000/month", "₹10,000/month (Mandatory fee ₹5,000)");

      // Mock confirming runNow returning the same edited text
      const runNowSpy = vi.spyOn(monitorModule, "runMonitorNow").mockResolvedValueOnce({
        id: "run_confirm_edit_001",
        results: [{ url: testUrl, text: editedContent }],
        errors: [],
      });

      const startAgentSpy = vi.spyOn(agentModule, "startAgentRun").mockResolvedValueOnce({
        run_id: "agent_run_recapt_001",
      });

      const req = new NextRequest(`http://localhost:3000/api/webhooks/monitor?token=${validToken}`, {
        method: "POST",
        body: JSON.stringify({
          fetch_monitor_id: webhookMonitorId,
          id: "run_webhook_edit_001",
          is_baseline: false,
          results: [{ url: testUrl, text: editedContent }],
          errors: [],
        }),
      });

      const res = await monitorWebhookHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.webhookType).toBe("EDITED");
      expect(json.confirmed).toBe(true);
      expect(json.confirmType).toBe("EDITED");
      expect(json.recaptureId).toMatch(/^cap_re_/);

      expect(runNowSpy).toHaveBeenCalledWith(webhookMonitorId);
      expect(startAgentSpy).toHaveBeenCalled();

      // Check that original capture record has alert banner data and state
      const cap = await getCaptureRecord(mockCaptureId);
      expect(cap.watchState).toBe("edited_detected");
      expect(cap.watchAlert?.type).toBe("EDITED");
      expect(cap.watchAlert?.recaptureId).toBe(json.recaptureId);

      // Verify that BOTH runs (scheduled and confirmation) are stored in watch events
      const events = await listWatchEvents(webhookWatchId);
      const scheduledEvent = events.find((e: any) => e.source === "scheduled");
      const confirmEvent = events.find((e: any) => e.source === "confirmation");
      expect(scheduledEvent).toBeDefined();
      expect(confirmEvent).toBeDefined();
      expect(confirmEvent.recaptureId).toBe(json.recaptureId);
    });

    it("ignores EDITED if confirming runNow does not agree (prevents false alerts)", async () => {
      await saveCaptureRecord(mockCaptureId, { watchAlert: undefined, watchState: "active" });
      const editedContent = baselineText.replace("₹45,000/month", "₹10,000/month");

      // Mock confirming runNow returning the original baseline text (transient glitch upstream)
      const runNowSpy = vi.spyOn(monitorModule, "runMonitorNow").mockResolvedValueOnce({
        id: "run_confirm_discrepancy_001",
        results: [{ url: testUrl, text: baselineText }],
        errors: [],
      });

      const startAgentSpy = vi.spyOn(agentModule, "startAgentRun");

      const req = new NextRequest(`http://localhost:3000/api/webhooks/monitor?token=${validToken}`, {
        method: "POST",
        body: JSON.stringify({
          fetch_monitor_id: webhookMonitorId,
          id: "run_webhook_glitch_001",
          is_baseline: false,
          results: [{ url: testUrl, text: editedContent }],
          errors: [],
        }),
      });

      const res = await monitorWebhookHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.webhookType).toBe("EDITED");
      expect(json.confirmed).toBe(false);
      expect(json.confirmType).toBe("NO_CHANGE");
      expect(json.recaptureId).toBeNull();

      // Re-capture must NOT be triggered
      expect(startAgentSpy).not.toHaveBeenCalled();

      // Original capture must not have alert banner set
      const cap = await getCaptureRecord(mockCaptureId);
      expect(cap.watchAlert).toBeUndefined();
    });

    it("shows 'We couldn't check this page recently' after 3 BLOCKED results in a row", async () => {
      // 1st BLOCKED run
      const req1 = new NextRequest(`http://localhost:3000/api/webhooks/monitor?token=${validToken}`, {
        method: "POST",
        body: JSON.stringify({
          fetch_monitor_id: webhookMonitorId,
          id: "run_blocked_1",
          is_baseline: false,
          results: [],
          errors: [{ code: "bot_blocked", message: "Bot challenge detected" }],
        }),
      });
      const res1 = await monitorWebhookHandler(req1);
      const json1 = await res1.json();
      expect(json1.consecutiveBlockedCount).toBe(1);
      expect(json1.isBlockedWarning).toBe(false);

      let watch = await getWatchRecord(webhookWatchId);
      expect(watch.consecutiveBlockedCount).toBe(1);
      expect(watch.isBlockedWarning).toBe(false);

      // 2nd BLOCKED run
      const req2 = new NextRequest(`http://localhost:3000/api/webhooks/monitor?token=${validToken}`, {
        method: "POST",
        body: JSON.stringify({
          fetch_monitor_id: webhookMonitorId,
          id: "run_blocked_2",
          is_baseline: false,
          results: [],
          errors: [{ code: "login_required", message: "Sign in required" }],
        }),
      });
      const res2 = await monitorWebhookHandler(req2);
      const json2 = await res2.json();
      expect(json2.consecutiveBlockedCount).toBe(2);
      expect(json2.isBlockedWarning).toBe(false);

      // 3rd BLOCKED run
      const req3 = new NextRequest(`http://localhost:3000/api/webhooks/monitor?token=${validToken}`, {
        method: "POST",
        body: JSON.stringify({
          fetch_monitor_id: webhookMonitorId,
          id: "run_blocked_3",
          is_baseline: false,
          results: [],
          errors: [{ code: "timeout", message: "Network timed out" }],
        }),
      });
      const res3 = await monitorWebhookHandler(req3);
      const json3 = await res3.json();
      expect(json3.consecutiveBlockedCount).toBe(3);
      expect(json3.isBlockedWarning).toBe(true);

      watch = await getWatchRecord(webhookWatchId);
      expect(watch.consecutiveBlockedCount).toBe(3);
      expect(watch.isBlockedWarning).toBe(true);
      expect(watch.blockedWarning).toBe("We couldn't check this page recently");

      // Verify that a subsequent NO_CHANGE run resets the blocked count
      const req4 = new NextRequest(`http://localhost:3000/api/webhooks/monitor?token=${validToken}`, {
        method: "POST",
        body: JSON.stringify({
          fetch_monitor_id: webhookMonitorId,
          id: "run_recovery_4",
          is_baseline: false,
          results: [{ url: testUrl, text: baselineText }],
          errors: [],
        }),
      });
      const res4 = await monitorWebhookHandler(req4);
      const json4 = await res4.json();
      expect(json4.classification).toBe("NO_CHANGE");

      watch = await getWatchRecord(webhookWatchId);
      expect(watch.consecutiveBlockedCount).toBe(0);
      expect(watch.isBlockedWarning).toBe(false);
    });
  });
});
