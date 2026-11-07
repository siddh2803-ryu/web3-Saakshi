import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import {
  getWatchRecord,
  getWatchByMonitorId,
  saveWatchRecord,
  saveWatchEvent,
  getCaptureRecord,
  saveCaptureRecord,
} from "@/lib/firebase/admin";
import { classifyWatchRun } from "@/lib/watch/classify";
import { runMonitorNow } from "@/lib/tinyfish/monitor";
import { startAgentRun } from "@/lib/tinyfish/agent";

export const dynamic = "force-dynamic";

/**
 * Zod schema validating incoming TinyFish Monitor webhook payload.
 * Expected fields: fetch_monitor_id, id (run ID), is_baseline, results, errors.
 */
const MonitorWebhookPayloadSchema = z.object({
  fetch_monitor_id: z.string().min(1, "fetch_monitor_id is required"),
  id: z.string().min(1, "run id is required"),
  is_baseline: z.boolean().default(false),
  results: z.array(z.any()).default([]),
  errors: z.array(z.any()).default([]),
});

/**
 * POST /api/webhooks/monitor?token=WEBHOOK_SECRET
 * Handles scheduled page evaluation notifications from TinyFish Page Monitor.
 *
 * Rules:
 * 1. Authenticate with ?token=WEBHOOK_SECRET (401 if missing/wrong).
 * 2. Validate payload structure with Zod (400 if malformed).
 * 3. Ignore baseline runs (is_baseline: true).
 * 4. Look up watch by monitor ID and ignore unknown monitors.
 * 5. Deduplicate by run ID (TinyFish retries up to 3 times).
 * 6. Confirm-before-acting: EDITED or DELETED triggers one runNow to confirm.
 *    Only alert and re-capture if the confirmation agrees. Store both runs.
 * 7. NO_CHANGE and BLOCKED just add timeline entry; >= 3 BLOCKED in a row sets blockedWarning.
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const expectedToken = process.env.WEBHOOK_SECRET || "dev_webhook_secret";

    // 1. Check token first
    if (!token || token !== expectedToken) {
      return NextResponse.json({ error: "Invalid or missing monitor webhook token" }, { status: 401 });
    }

    // 2. Validate the payload with Zod
    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
    }

    // Allow monitor_id as fallback alias for fetch_monitor_id if needed
    if (!rawBody.fetch_monitor_id && rawBody.monitor_id) {
      rawBody.fetch_monitor_id = rawBody.monitor_id;
    }
    if (!rawBody.id && rawBody.run_id) {
      rawBody.id = rawBody.run_id;
    }
    const queryWatchId = searchParams.get("watchId");
    if (!rawBody.fetch_monitor_id && queryWatchId) {
      const w = await getWatchRecord(queryWatchId);
      if (w?.monitorId) {
        rawBody.fetch_monitor_id = w.monitorId;
      }
    }

    const parseRes = MonitorWebhookPayloadSchema.safeParse(rawBody);
    if (!parseRes.success) {
      return NextResponse.json(
        { error: "Invalid webhook payload structure", details: parseRes.error.format() },
        { status: 400 }
      );
    }
    const payload = parseRes.data;

    // 3. Ignore baseline runs
    if (payload.is_baseline) {
      return NextResponse.json(
        { received: true, ignored: true, reason: "baseline", runId: payload.id },
        { status: 200 }
      );
    }

    // 4. Look up the watch by monitor ID (and fallback to query param watchId)
    const monitorId = payload.fetch_monitor_id;
    let watch = await getWatchByMonitorId(monitorId);
    if (!watch && queryWatchId) {
      watch = await getWatchRecord(queryWatchId);
    }

    // Ignore unknown monitors
    if (!watch) {
      return NextResponse.json(
        { received: true, ignored: true, reason: "unknown_monitor", monitorId },
        { status: 200 }
      );
    }

    // 5. Deduplicate by run ID (TinyFish retries up to 3 times)
    const runId = payload.id;
    const processedRunIds: string[] = Array.isArray(watch.processedRunIds) ? watch.processedRunIds : [];
    if (processedRunIds.includes(runId)) {
      return NextResponse.json(
        { received: true, ignored: true, reason: "duplicate_run", runId },
        { status: 200 }
      );
    }

    const updatedProcessedRunIds = [...processedRunIds, runId];

    // Extract previous text for diffing
    const previousCapture = await getCaptureRecord(watch.captureId);
    const previousText =
      watch.baselineText ||
      watch.lastText ||
      previousCapture?.manifest?.artifacts?.find((a: any) => a.kind === "fetch_markdown")?.content ||
      previousCapture?.observed?.title ||
      "";

    const rawText = payload.results?.[0]?.text || "";
    const errors = payload.errors || [];

    // Classify incoming webhook run
    const webhookClassification = classifyWatchRun({
      results: payload.results,
      errors,
      newRawText: rawText,
      lastKnownContentHash: watch.lastContentHash || watch.baselineContentHash,
      previousText,
    });

    // Handle NO_CHANGE
    if (webhookClassification.type === "NO_CHANGE") {
      const eventId = `wevent_sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await saveWatchEvent(watch.id, {
        id: eventId,
        watchId: watch.id,
        runId,
        type: "NO_CHANGE",
        source: "scheduled",
        contentHash: webhookClassification.newContentHash,
        diff: null,
        reason: webhookClassification.reason,
        recaptureId: null,
        detectedAt: new Date().toISOString(),
      });

      await saveWatchRecord(watch.id, {
        lastContentHash: webhookClassification.newContentHash,
        lastCheckedAt: new Date().toISOString(),
        consecutiveBlockedCount: 0,
        isBlockedWarning: false,
        processedRunIds: updatedProcessedRunIds,
        updatedAt: new Date().toISOString(),
      });

      return NextResponse.json({
        received: true,
        classification: "NO_CHANGE",
        runId,
      });
    }

    // Handle BLOCKED: after 3 in a row, show warning
    if (webhookClassification.type === "BLOCKED") {
      const blockedCount = (watch.consecutiveBlockedCount || 0) + 1;
      const isBlockedWarning = blockedCount >= 3;

      const eventId = `wevent_sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await saveWatchEvent(watch.id, {
        id: eventId,
        watchId: watch.id,
        runId,
        type: "BLOCKED",
        source: "scheduled",
        contentHash: watch.lastContentHash || watch.baselineContentHash,
        diff: null,
        reason: webhookClassification.reason,
        recaptureId: null,
        detectedAt: new Date().toISOString(),
      });

      await saveWatchRecord(watch.id, {
        lastCheckedAt: new Date().toISOString(),
        consecutiveBlockedCount: blockedCount,
        isBlockedWarning,
        blockedWarning: isBlockedWarning ? "We couldn't check this page recently" : null,
        processedRunIds: updatedProcessedRunIds,
        updatedAt: new Date().toISOString(),
      });

      return NextResponse.json({
        received: true,
        classification: "BLOCKED",
        consecutiveBlockedCount: blockedCount,
        isBlockedWarning,
        runId,
      });
    }

    // -------------------------------------------------------------------------
    // Confirm-before-acting for EDITED and DELETED:
    // Webhook results cannot be signature-checked or re-read from API.
    // Trigger one runNow to confirm. Only alert & re-capture if confirmation agrees.
    // Store both runs.
    // -------------------------------------------------------------------------

    // 1. Store the scheduled webhook run event first
    const schedEventId = `wevent_sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await saveWatchEvent(watch.id, {
      id: schedEventId,
      watchId: watch.id,
      runId,
      type: webhookClassification.type,
      source: "scheduled",
      contentHash: webhookClassification.newContentHash,
      diff: webhookClassification.diff?.unifiedDiff || null,
      reason: `Webhook: ${webhookClassification.reason} (confirming via runNow...)`,
      recaptureId: null,
      detectedAt: new Date().toISOString(),
    });

    // 2. Trigger one runNow to confirm
    let confirmRun: any;
    try {
      confirmRun = await runMonitorNow(watch.monitorId);
    } catch (confirmErr: any) {
      const errMsg = confirmErr?.message || String(confirmErr);
      if (errMsg.includes("page_not_found") || errMsg.includes("404")) {
        confirmRun = {
          id: `run_notfound_${Date.now()}`,
          status: "FAILED",
          results: [],
          errors: [{ code: "page_not_found", status: 404, message: "Target page not found (HTTP 404)" }],
        };
      } else {
        throw confirmErr;
      }
    }

    const confirmText = confirmRun.results?.[0]?.text || "";
    const confirmErrors = confirmRun.errors || [];
    const confirmClassification = classifyWatchRun({
      results: confirmRun.results,
      errors: confirmErrors,
      newRawText: confirmText,
      lastKnownContentHash: watch.lastContentHash || watch.baselineContentHash,
      previousText,
    });

    const confirmRunId = confirmRun.id || `run_conf_${Date.now()}`;
    updatedProcessedRunIds.push(confirmRunId);

    // 3. Check if confirmation agrees
    const agrees = confirmClassification.type === webhookClassification.type;

    let recaptureId: string | null = null;

    if (agrees) {
      // Both runs agree: alert and re-capture!
      recaptureId = `cap_re_${crypto.randomBytes(16).toString("hex")}`;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const webhookSecret = process.env.WEBHOOK_SECRET || "dev_webhook_secret";
      const recaptureWebhookUrl = `${appUrl}/api/webhooks/tinyfish?token=${webhookSecret}&captureId=${recaptureId}`;

      const alertData = {
        type: confirmClassification.type,
        reason: confirmClassification.reason,
        detectedAt: new Date().toISOString(),
        recaptureId,
        diffExcerpt: confirmClassification.diff?.unifiedDiff?.slice(0, 300) || null,
      };

      await saveCaptureRecord(recaptureId, {
        id: recaptureId,
        ownerUid: watch.ownerUid,
        previousCaptureId: watch.captureId,
        watchId: watch.id,
        url: watch.url,
        finalUrl: watch.url,
        goal: `Scheduled watch alert (${confirmClassification.type}). Confirmed via runNow. Preserving diff.`,
        mode: "standard",
        status: "QUEUED",
        events: [
          {
            stage: "QUEUED",
            message: `Automatic re-capture initiated following confirmed ${confirmClassification.type} detection`,
            at: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await saveCaptureRecord(watch.captureId, {
        watchAlert: alertData,
        watchState: confirmClassification.type === "DELETED" ? "deleted_detected" : "edited_detected",
      });

      startAgentRun({
        url: watch.url,
        userGoal: `Scheduled watch alert (${confirmClassification.type}). Confirmed via runNow. Preserving diff.`,
        webhookUrl: recaptureWebhookUrl,
      }).catch((e) => console.error("Auto recapture background error:", e));
    }

    // 4. Store the confirmation run event
    const confirmEventId = `wevent_conf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await saveWatchEvent(watch.id, {
      id: confirmEventId,
      watchId: watch.id,
      runId: confirmRunId,
      type: confirmClassification.type,
      source: "confirmation",
      contentHash: confirmClassification.newContentHash,
      diff: confirmClassification.diff?.unifiedDiff || null,
      reason: agrees
        ? `Confirmed ${confirmClassification.type} via runNow (${confirmClassification.reason})`
        : `Discrepancy ignored: Webhook reported ${webhookClassification.type} but runNow found ${confirmClassification.type}`,
      recaptureId,
      detectedAt: new Date().toISOString(),
    });

    // Update watch record
    await saveWatchRecord(watch.id, {
      lastContentHash: confirmClassification.newContentHash,
      lastCheckedAt: new Date().toISOString(),
      state: agrees
        ? (confirmClassification.type === "DELETED" ? "deleted_detected" : "edited_detected")
        : watch.state,
      consecutiveBlockedCount: 0,
      isBlockedWarning: false,
      blockedWarning: null,
      processedRunIds: updatedProcessedRunIds,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      received: true,
      webhookType: webhookClassification.type,
      confirmed: agrees,
      confirmType: confirmClassification.type,
      recaptureId,
      runId,
      confirmRunId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Monitor webhook error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
