import { NextRequest, NextResponse } from "next/server";
import { runFinalizePipeline } from "@/lib/pipeline/finalize";
import { getCaptureRecord, listArtifactRecords } from "@/lib/firebase/admin";
import { requireAuth, requireOwner } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = requireAuth(req);
    if ("response" in auth) return auth.response;

    const captureId = params.id;
    const capture = await getCaptureRecord(captureId);
    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    const authError = requireOwner(auth.user.uid, capture.ownerUid);
    if (authError) return authError;

    const ok = await runFinalizePipeline(captureId);
    const updatedCapture = await getCaptureRecord(captureId);
    const artifacts = await listArtifactRecords(captureId);

    return NextResponse.json({
      success: ok,
      capture: {
        ...updatedCapture,
        artifacts,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
