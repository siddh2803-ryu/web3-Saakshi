import { NextRequest, NextResponse } from "next/server";
import {
  getWatchRecord,
  saveWatchRecord,
  saveWatchEvent,
  getCaptureRecord,
  saveCaptureRecord,
} from "@/lib/firebase/admin";
import { runMonitorNow } from "@/lib/tinyfish/monitor";
import { classifyWatchCheck } from "@/lib/watch/classify";
import { fetchCleanText } from "@/lib/tinyfish/fetch";
import { startAgentRun } from "@/lib/tinyfish/agent";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const watchId = params.id;
    const watch = await getWatchRecord(watchId);

    if (!watch) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }

    const previousCapture = await getCaptureRecord(watch.captureId);
    const previousText = previousCapture?.manifest?.artifacts?.find(
      (a: any) => a.kind === "fetch_markdown"
    )?.content || previousCapture?.observed?.title || "";

    // 1. Run monitor now via TinyFish
    const monitorRun = await runMonitorNow(watch.monitorId);

    // 2. Fetch fresh text directly as well to ensure latest snapshot
    let freshText = monitorRun.results?.[0]?.text || "";
    let errors = monitorRun.errors || [];

    if (!freshText && errors.length === 0) {
      const freshFetch = await fetchCleanText(watch.url);
      freshText = freshFetch.text;
      errors = freshFetch.errors || [];
    }

    // 3. Classify result
    const classification = classifyWatchCheck(
      errors,
      freshText,
      watch.lastContentHash,
      previousText
    );

    const eventId = `wevent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let recaptureId: string | null = null;

    // 4. On EDITED or DELETED: initiate automatic re-capture (FR-8.4)
    if (classification.type === "EDITED" || classification.type === "DELETED") {
      recaptureId = `cap_re_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const webhookSecret = process.env.WEBHOOK_SECRET || "dev_webhook_secret";
      const webhookUrl = `${appUrl}/api/webhooks/tinyfish?token=${webhookSecret}&captureId=${recaptureId}`;

      const newCapRecord = {
        id: recaptureId,
        ownerUid: watch.ownerUid,
        previousCaptureId: watch.captureId,
        watchId,
        url: watch.url,
        finalUrl: watch.url,
        goal: `Automatic re-capture triggered by ${classification.type} alert. Preserve evidence diff.`,
        mode: "standard",
        status: "QUEUED",
        events: [
          {
            stage: "QUEUED",
            message: `Automatic re-capture initiated following ${classification.type} detection`,
            at: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveCaptureRecord(recaptureId, newCapRecord);

      startAgentRun({
        url: watch.url,
        userGoal: newCapRecord.goal,
        webhookUrl,
      }).catch((e) => console.error("Auto re-capture start error:", e));
    }

    // 5. Store watch event
    const watchEvent = {
      id: eventId,
      watchId,
      type: classification.type,
      source: "manual",
      contentHash: classification.newContentHash,
      diff: classification.diff?.unifiedDiff || null,
      reason: classification.reason,
      recaptureId,
      detectedAt: new Date().toISOString(),
    };
    await saveWatchEvent(watchId, watchEvent);

    // 6. Update watch record
    await saveWatchRecord(watchId, {
      lastContentHash: classification.newContentHash,
      lastCheckedAt: new Date().toISOString(),
      state: classification.type === "DELETED" ? "deleted_detected" : watch.state,
    });

    return NextResponse.json({
      success: true,
      event: watchEvent,
      classification,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Watch check error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
