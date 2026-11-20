import { NextRequest, NextResponse } from "next/server";
import { getCaptureRecord, listCustodyEvents } from "@/lib/firebase/admin";
import { verifyCustodyChain } from "@/lib/custody/model";
import { requireAuth, requireOwner } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(
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

    const events = await listCustodyEvents(captureId, "asc");
    const verification = verifyCustodyChain(events);

    return NextResponse.json({
      success: true,
      captureId,
      events,
      verification,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
