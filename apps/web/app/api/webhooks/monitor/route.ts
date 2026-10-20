import { NextRequest, NextResponse } from "next/server";
import {
  getWatchRecord,
  saveWatchRecord,
  saveWatchEvent,
  getCaptureRecord,
  saveCaptureRecord,
} from "@/lib/firebase/admin";
import { classifyWatchCheck } from "@/lib/watch/classify";
import { startAgentRun } from "@/lib/tinyfish/agent";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const watchId = searchParams.get("watchId");

    const expectedToken = process.env.WEBHOOK_SECRET || "dev_webhook_secret";
    if (token !== expectedToken) {
      return NextResponse.json({ error: "Invalid monitor webhook token" }, { status: 401 });
    }

    if (!watchId) {
      return NextResponse.json({ error: "watchId parameter required" }, { status: 400 });
    }

    const watch = await getWatchRecord(watchId);
    if (!watch) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const results = body.results || [];
    const errors = body.errors || [];
    const rawText = results[0]?.text || "";

    const previousCapture = await getCaptureRecord(watch.captureId);
    const previousText = previousCapture?.manifest?.artifacts?.find(
      (a: any) => a.kind === "fetch_markdown"
    )?.content || previousCapture?.observed?.title || "";

    const classification = classifyWatchCheck(
      errors,
      rawText,
      watch.lastContentHash,
      previousText
    );

    const eventId = `wevent_sched_${Date.now()}`;
    let recaptureId: string | null = null;

    if (classification.type === "EDITED" || classification.type === "DELETED") {
      recaptureId = `cap_re_${Date.now().toString(36)}`;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const webhookSecret = process.env.WEBHOOK_SECRET || "dev_webhook_secret";
      const webhookUrl = `${appUrl}/api/webhooks/tinyfish?token=${webhookSecret}&captureId=${recaptureId}`;

      await saveCaptureRecord(recaptureId, {
        id: recaptureId,
        ownerUid: watch.ownerUid,
        previousCaptureId: watch.captureId,
        watchId,
        url: watch.url,
        finalUrl: watch.url,
        goal: `Scheduled watch alert (${classification.type}). Preserving diff.`,
        mode: "standard",
        status: "QUEUED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      startAgentRun({
        url: watch.url,
        userGoal: `Scheduled watch alert (${classification.type}). Preserving diff.`,
        webhookUrl,
      }).catch((e) => console.error("Auto recapture error:", e));
    }

    await saveWatchEvent(watchId, {
      id: eventId,
      watchId,
      type: classification.type,
      source: "scheduled",
      contentHash: classification.newContentHash,
      diff: classification.diff?.unifiedDiff || null,
      reason: classification.reason,
      recaptureId,
      detectedAt: new Date().toISOString(),
    });

    await saveWatchRecord(watchId, {
      lastContentHash: classification.newContentHash,
      lastCheckedAt: new Date().toISOString(),
      state: classification.type === "DELETED" ? "deleted_detected" : watch.state,
    });

    return NextResponse.json({ received: true, classification: classification.type });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Monitor webhook error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
