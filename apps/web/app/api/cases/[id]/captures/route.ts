import { NextRequest, NextResponse } from "next/server";
import { getCaseRecord, assignCaptureToCase, getCaptureRecord } from "@/lib/firebase/admin";
import { requireAuth, requireOwner } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/cases/:id/captures - Assign or move a capture into this case
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = requireAuth(req);
    if ("response" in auth) return auth.response;

    const caseId = params.id;
    const c = await getCaseRecord(caseId);
    if (!c) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const authError = requireOwner(auth.user.uid, c.ownerUid);
    if (authError) return authError;

    const body = await req.json().catch(() => ({}));
    const captureId = body.captureId;
    if (!captureId || typeof captureId !== "string") {
      return NextResponse.json({ error: "Missing or invalid captureId parameter" }, { status: 400 });
    }

    const cap = await getCaptureRecord(captureId);
    if (!cap) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    const capAuthError = requireOwner(auth.user.uid, cap.ownerUid);
    if (capAuthError) return capAuthError;

    await assignCaptureToCase(captureId, caseId);
    const updatedCase = await getCaseRecord(caseId);
    return NextResponse.json({ success: true, case: updatedCase, captureId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/cases/:id/captures - Remove (unassign) a capture from this case
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = requireAuth(req);
    if ("response" in auth) return auth.response;

    const caseId = params.id;
    const c = await getCaseRecord(caseId);
    if (!c) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const authError = requireOwner(auth.user.uid, c.ownerUid);
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const captureId = searchParams.get("captureId") || body.captureId;

    if (!captureId || typeof captureId !== "string") {
      return NextResponse.json({ error: "Missing captureId parameter" }, { status: 400 });
    }

    await assignCaptureToCase(captureId, null);
    const updatedCase = await getCaseRecord(caseId);
    return NextResponse.json({ success: true, case: updatedCase, unassignedCaptureId: captureId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
