import { NextRequest, NextResponse } from "next/server";
import {
  getCaseRecord,
  saveCaseRecord,
  deleteCaseRecord,
  getCaptureRecord,
} from "@/lib/firebase/admin";
import { requireAuth, requireOwner } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(
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

    // Populate capture objects for timeline
    const captures = [];
    for (const cid of c.captureIds || []) {
      const cap = await getCaptureRecord(cid);
      if (cap) {
        captures.push(cap);
      }
    }

    return NextResponse.json({ case: c, captures });
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

    const caseId = params.id;
    const existing = await getCaseRecord(caseId);
    if (!existing) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const authError = requireOwner(auth.user.uid, existing.ownerUid);
    if (authError) return authError;

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, any> = {};

    if (typeof body.title === "string") {
      const trimmed = body.title.trim();
      if (trimmed.length > 0) {
        updates.title = trimmed;
      }
    }

    if (typeof body.notes === "string") {
      updates.notes = body.notes;
    }

    const updated = await saveCaseRecord(caseId, updates);
    return NextResponse.json({ success: true, case: updated });
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

    const caseId = params.id;
    const existing = await getCaseRecord(caseId);
    if (!existing) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const authError = requireOwner(auth.user.uid, existing.ownerUid);
    if (authError) return authError;

    const deleted = await deleteCaseRecord(caseId);
    if (!deleted) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, deleted: true, id: caseId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
