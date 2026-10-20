import { NextRequest, NextResponse } from "next/server";
import { runFinalizePipeline } from "@/lib/pipeline/finalize";
import { getCaptureRecord, saveCaptureRecord } from "@/lib/firebase/admin";

export const maxDuration = 300;

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

    // Reset error state and start finalize
    await saveCaptureRecord(captureId, {
      status: "AGENT_DONE",
      error: null,
      finalizing: false,
    });

    runFinalizePipeline(captureId).catch((e) => console.error("Retry finalize error:", e));

    return NextResponse.json({ success: true, message: "Pipeline resumed from failed stage" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
