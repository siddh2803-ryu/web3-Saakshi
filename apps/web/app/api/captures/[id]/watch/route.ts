import { NextRequest, NextResponse } from "next/server";
import {
  getCaptureRecord,
  saveCaptureRecord,
  saveWatchRecord,
  getWatchRecord,
  getWatchByCaptureId,
  listWatchEvents,
  countUserActiveWatches,
} from "@/lib/firebase/admin";
import {
  createPageMonitor,
  deleteMonitor,
  updateMonitor,
  listMonitors,
} from "@/lib/tinyfish/monitor";
import { normalizeWatchText } from "@/lib/watch/diff";
import { computeSha256 } from "@/lib/evidence/hash";

export const dynamic = "force-dynamic";

/**
 * GET /api/captures/:id/watch
 * Retrieves watch metadata and check timeline events for this capture.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const captureId = params.id;
    const capture = await getCaptureRecord(captureId);
    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    const watch = capture.watchId
      ? await getWatchRecord(capture.watchId)
      : await getWatchByCaptureId(captureId);

    const events = watch ? await listWatchEvents(watch.id) : [];

    return NextResponse.json({
      watch: watch || null,
      events,
      isWatching: Boolean(capture.isWatching && watch?.state === "active"),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/captures/:id/watch
 * Toggles watch on/off or updates schedule.
 * Enforces:
 * 1. User active watch limit (max 5 active watches per user)
 * 2. Account-wide guard (refuses if >= 45 saakshi-* monitors exist)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const captureId = params.id;
    const capture = await getCaptureRecord(captureId);

    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const existingWatch = capture.watchId
      ? await getWatchRecord(capture.watchId)
      : await getWatchByCaptureId(captureId);

    // 1. Handle toggle OFF (enabled: false)
    if (body.enabled === false) {
      if (existingWatch?.monitorId) {
        try {
          await deleteMonitor(existingWatch.monitorId);
        } catch (delErr) {
          console.warn("Failed to delete monitor on toggle off:", delErr);
        }
        await saveWatchRecord(existingWatch.id, {
          state: "disabled",
          disabledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      await saveCaptureRecord(captureId, { isWatching: false });

      return NextResponse.json({
        success: true,
        enabled: false,
        message: "Watch disabled and monitor deleted.",
      });
    }

    // 2. Handle toggle ON or update schedule
    const scheduleCron = body.scheduleCron || existingWatch?.scheduleCron || "0 * * * *";
    const userUid = capture.ownerUid || "demo-user";

    // Guard A: Per-user active watch limit (max 5 active watches)
    const userActiveCount = await countUserActiveWatches(userUid);
    const isAlreadyActive = existingWatch && existingWatch.state === "active";
    if (!isAlreadyActive && userActiveCount >= 5) {
      return NextResponse.json(
        {
          error: "Active watch limit reached: maximum 5 active watches per user.",
          code: "USER_WATCH_LIMIT_EXCEEDED",
          limit: 5,
          active: userActiveCount,
        },
        { status: 400 }
      );
    }

    // Guard B: Account monitor guard (refuse new monitors if account has >= 45 saakshi-* monitors)
    if (!isAlreadyActive) {
      const allMonitors = await listMonitors();
      const saakshiMonitors = allMonitors.filter(
        (m) => m.name && m.name.startsWith("saakshi-")
      );
      if (saakshiMonitors.length >= 45) {
        return NextResponse.json(
          {
            error: "Monitor limit reached: account has 45 or more active monitors.",
            code: "ACCOUNT_MONITOR_LIMIT_REACHED",
            limit: 45,
            activeCount: saakshiMonitors.length,
          },
          { status: 429 }
        );
      }
    }

    // If already active with a monitor, and only schedule changed, update it directly
    if (isAlreadyActive && existingWatch?.monitorId) {
      if (body.scheduleCron && body.scheduleCron !== existingWatch.scheduleCron) {
        const updatedMonitor = await updateMonitor(existingWatch.monitorId, {
          schedule_cron: scheduleCron,
        });
        const updatedWatch = {
          ...existingWatch,
          scheduleCron: updatedMonitor.schedule_cron,
          updatedAt: new Date().toISOString(),
        };
        await saveWatchRecord(existingWatch.id, updatedWatch);
        return NextResponse.json({
          success: true,
          watch: updatedWatch,
        });
      }

      return NextResponse.json({
        success: true,
        watch: existingWatch,
      });
    }

    // If there was an old stale monitor, delete it before creating a new one
    if (existingWatch?.monitorId) {
      try {
        await deleteMonitor(existingWatch.monitorId);
      } catch (delOldErr) {
        console.warn("Cleaned up previous monitor before reactivation:", delOldErr);
      }
    }

    // Create new TinyFish Page Monitor
    const targetUrl = capture.finalUrl || capture.url;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const webhookSecret = process.env.WEBHOOK_SECRET || "dev_webhook_secret";
    const watchId = existingWatch?.id || `watch_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const webhookUrl = `${appUrl}/api/webhooks/monitor?token=${webhookSecret}&watchId=${watchId}`;

    const monitorRes = await createPageMonitor({
      captureId,
      url: targetUrl,
      scheduleCron,
      webhookUrl,
    });

    // Extract baseline run result and normalize content hash
    const rawBaseline = monitorRes.run?.results?.[0]?.text;
    const baselineStr =
      typeof rawBaseline === "string"
        ? rawBaseline
        : rawBaseline
        ? JSON.stringify(rawBaseline)
        : "";
    const normBaseline = normalizeWatchText(baselineStr);
    const baselineHash = normBaseline
      ? computeSha256(normBaseline)
      : capture.contentHash || "";

    const watchRecord = {
      id: watchId,
      ownerUid: userUid,
      captureId,
      url: targetUrl,
      monitorId: monitorRes.monitor.id,
      scheduleCron: monitorRes.monitor.schedule_cron,
      baselineContentHash: baselineHash,
      lastContentHash: baselineHash,
      baselineText: baselineStr,
      lastText: baselineStr,
      lastCheckedAt: new Date().toISOString(),
      state: "active",
      createdAt: existingWatch?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveWatchRecord(watchId, watchRecord);
    await saveCaptureRecord(captureId, { watchId, isWatching: true });

    return NextResponse.json({
      success: true,
      watch: watchRecord,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Create watch error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/captures/:id/watch
 * Turns off watch and deletes the TinyFish monitor.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const captureId = params.id;
    const capture = await getCaptureRecord(captureId);
    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    const watch = capture.watchId
      ? await getWatchRecord(capture.watchId)
      : await getWatchByCaptureId(captureId);

    if (watch?.monitorId) {
      try {
        await deleteMonitor(watch.monitorId);
      } catch (delErr) {
        console.warn("Failed to delete monitor on DELETE:", delErr);
      }
      await saveWatchRecord(watch.id, {
        state: "disabled",
        disabledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    await saveCaptureRecord(captureId, { isWatching: false });

    return NextResponse.json({
      success: true,
      message: "Watch disabled and monitor deleted.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
