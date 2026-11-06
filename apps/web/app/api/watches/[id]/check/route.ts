import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getWatchRecord,
  saveWatchRecord,
  saveWatchEvent,
  getCaptureRecord,
  saveCaptureRecord,
  listArtifactRecords,
} from "@/lib/firebase/admin";
import { runMonitorNow } from "@/lib/tinyfish/monitor";
import { classifyWatchRun } from "@/lib/watch/classify";
import { fetchCleanText } from "@/lib/tinyfish/fetch";
import { startAgentRun } from "@/lib/tinyfish/agent";

export const dynamic = "force-dynamic";
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

    // 1. Resolve previous text for diffing
    let previousText = watch.lastText || watch.baselineText || "";
    if (!previousText && watch.captureId) {
      const previousCapture = await getCaptureRecord(watch.captureId);
      const manifestArt = previousCapture?.manifest?.artifacts?.find(
        (a: any) => a.kind === "fetch_markdown"
      );
      if (manifestArt?.content) {
        previousText = manifestArt.content;
      } else {
        const arts = await listArtifactRecords(watch.captureId);
        const fArt = arts.find((a: any) => a.kind === "fetch_markdown");
        if (fArt?.plaintextBuffer) {
          previousText = Buffer.isBuffer(fArt.plaintextBuffer)
            ? fArt.plaintextBuffer.toString("utf8")
            : String(fArt.plaintextBuffer);
        }
      }
    }

    // 2. Run monitor now via TinyFish
    let monitorRun;
    try {
      monitorRun = await runMonitorNow(watch.monitorId);
    } catch (runErr: unknown) {
      const msg = runErr instanceof Error ? runErr.message : String(runErr);
      if (msg.includes("page_not_found") || msg.includes("404")) {
        monitorRun = {
          id: `run_notfound_${Date.now()}`,
          results: [],
          errors: [{ code: "page_not_found", status: 404, message: "Target page not found (HTTP 404)" }],
        };
      } else {
        throw runErr;
      }
    }

    // 3. Extract fresh text (fallback to fetch if run-now payload is empty and no errors)
    const rawRunText = monitorRun.results?.[0]?.text;
    let freshText =
      typeof rawRunText === "string"
        ? rawRunText
        : rawRunText
        ? JSON.stringify(rawRunText)
        : "";
    let errors = monitorRun.errors || [];

    if (!freshText && errors.length === 0) {
      try {
        const freshFetch = await fetchCleanText(watch.url);
        freshText = freshFetch.text;
        errors = freshFetch.errors || [];
      } catch (fetchErr) {
        console.warn("Direct fetch fallback error:", fetchErr);
      }
    }

    // 4. Classify run result inline
    const classification = classifyWatchRun({
      results: monitorRun.results,
      errors,
      newRawText: freshText,
      lastKnownContentHash: watch.lastContentHash,
      previousText,
    });

    const eventId = `wevent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let recaptureId: string | null = null;

    // 5. On EDITED or DELETED: initiate automatic re-capture and in-app alert banner
    if (classification.type === "EDITED" || classification.type === "DELETED") {
      recaptureId = `cap_re_${crypto.randomBytes(16).toString("hex")}`;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const webhookSecret = process.env.WEBHOOK_SECRET || "dev_webhook_secret";
      const webhookUrl = `${appUrl}/api/webhooks/tinyfish?token=${webhookSecret}&captureId=${recaptureId}`;

      const alertData = {
        type: classification.type,
        reason: classification.reason,
        detectedAt: new Date().toISOString(),
        recaptureId,
        diffExcerpt: classification.diff?.unifiedDiff?.slice(0, 300) || null,
      };

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

      // Save alert banner state on the original capture record
      await saveCaptureRecord(watch.captureId, {
        watchAlert: alertData,
        watchState: classification.type === "DELETED" ? "deleted_detected" : "edited_detected",
      });

      // Launch TinyFish Web Agent for the re-capture
      startAgentRun({
        url: watch.url,
        userGoal: newCapRecord.goal,
        webhookUrl,
      }).catch((e) => console.error("Auto re-capture start error:", e));
    }

    // 6. Store watch event
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

    // 7. Update watch record with latest state and text
    await saveWatchRecord(watchId, {
      lastContentHash: classification.newContentHash,
      lastCheckedAt: new Date().toISOString(),
      lastText: freshText || watch.lastText,
      state:
        classification.type === "DELETED"
          ? "deleted_detected"
          : classification.type === "EDITED"
          ? "edited_detected"
          : watch.state,
      updatedAt: new Date().toISOString(),
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
