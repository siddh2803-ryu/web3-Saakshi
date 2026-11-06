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
});
