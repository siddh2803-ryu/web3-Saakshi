import { NextRequest, NextResponse } from "next/server";
import { getWatchRecord, saveWatchRecord, listWatchEvents } from "@/lib/firebase/admin";
import { updateMonitor } from "@/lib/tinyfish/monitor";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const watchId = params.id;
    const watch = await getWatchRecord(watchId);

    if (!watch) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }

    const events = await listWatchEvents(watchId);
    return NextResponse.json({
      watch: {
        ...watch,
        events,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const watchId = params.id;
    const watch = await getWatchRecord(watchId);

    if (!watch) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }

    const body = await req.json();
    const { state, scheduleCron } = body;

    const updates: Record<string, unknown> = {};
    if (state === "active" || state === "paused") {
      updates.state = state;
      await updateMonitor(watch.monitorId, { status: state });
    }
    if (scheduleCron) {
      updates.scheduleCron = scheduleCron;
      await updateMonitor(watch.monitorId, { schedule_cron: scheduleCron });
    }

    await saveWatchRecord(watchId, updates);

    return NextResponse.json({
      success: true,
      watch: { ...watch, ...updates },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
