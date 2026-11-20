import { NextRequest, NextResponse } from "next/server";
import { getWatchRecord, saveWatchRecord, listWatchEvents } from "@/lib/firebase/admin";
import { updateMonitor, deleteMonitor } from "@/lib/tinyfish/monitor";
import { requireAuth, requireOwner } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = requireAuth(req);
    if ("response" in auth) return auth.response;

    const watchId = params.id;
    const watch = await getWatchRecord(watchId);

    if (!watch) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }

    const authError = requireOwner(auth.user.uid, watch.ownerUid);
    if (authError) return authError;

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
    const auth = requireAuth(req);
    if ("response" in auth) return auth.response;

    const watchId = params.id;
    const watch = await getWatchRecord(watchId);

    if (!watch) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }

    const authError = requireOwner(auth.user.uid, watch.ownerUid);
    if (authError) return authError;

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = requireAuth(req);
    if ("response" in auth) return auth.response;

    const watchId = params.id;
    const watch = await getWatchRecord(watchId);

    if (!watch) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }

    const authError = requireOwner(auth.user.uid, watch.ownerUid);
    if (authError) return authError;

    if (watch.monitorId) {
      try {
        await deleteMonitor(watch.monitorId);
      } catch (mErr) {
        console.warn("Failed to delete monitor:", mErr);
      }
    }

    await saveWatchRecord(watchId, {
      state: "deleted",
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, deleted: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
