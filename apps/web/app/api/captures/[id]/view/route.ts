import { NextRequest, NextResponse } from "next/server";
import { getCaptureRecord, recordViewCustodyEvent } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

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

    const body = await req.json().catch(() => ({}));
    const actorId = auth.user.uid || body.actorId || capture.ownerUid || "owner";

    const result = await recordViewCustodyEvent(captureId, actorId);
    return NextResponse.json({
      success: true,
      recorded: result.recorded,
      throttled: result.throttled,
      event: result.event,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
