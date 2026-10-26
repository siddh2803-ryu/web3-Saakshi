import { NextRequest, NextResponse } from "next/server";
import { runFinalizePipeline } from "@/lib/pipeline/finalize";
import { getCaptureRecord, listArtifactRecords } from "@/lib/firebase/admin";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const captureId = params.id;
    const ok = await runFinalizePipeline(captureId);
    const capture = await getCaptureRecord(captureId);
    const artifacts = await listArtifactRecords(captureId);

    return NextResponse.json({
      success: ok,
      capture: {
        ...capture,
        artifacts,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
