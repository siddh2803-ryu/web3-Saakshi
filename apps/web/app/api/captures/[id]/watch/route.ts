import { NextRequest, NextResponse } from "next/server";
import { getCaptureRecord, saveCaptureRecord, saveWatchRecord } from "@/lib/firebase/admin";
import { createPageMonitor } from "@/lib/tinyfish/monitor";

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
    const scheduleCron = body.scheduleCron || "0 * * * *"; // hourly default

    const targetUrl = capture.finalUrl || capture.url;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const webhookSecret = process.env.WEBHOOK_SECRET || "dev_webhook_secret";
    const watchId = `watch_${Date.now().toString(36)}`;
    const webhookUrl = `${appUrl}/api/webhooks/monitor?token=${webhookSecret}&watchId=${watchId}`;

    const monitorRes = await createPageMonitor({
      captureId,
      url: targetUrl,
      scheduleCron,
      webhookUrl,
    });

    const watchRecord = {
      id: watchId,
      ownerUid: capture.ownerUid || "demo-user",
      captureId,
      url: targetUrl,
      monitorId: monitorRes.monitor.id,
      scheduleCron: monitorRes.monitor.schedule_cron,
      lastContentHash: capture.contentHash || "",
      lastCheckedAt: new Date().toISOString(),
      state: "active",
      createdAt: new Date().toISOString(),
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
