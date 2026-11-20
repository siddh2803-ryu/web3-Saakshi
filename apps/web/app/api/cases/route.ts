import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { listUserCases, saveCaseRecord } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ("response" in auth) return auth.response;
    const cases = await listUserCases(auth.user.uid);
    return NextResponse.json({ cases });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ("response" in auth) return auth.response;

    const body = await req.json().catch(() => ({}));
    const uid = auth.user.uid;
    const title = (body.title || "").trim() || "Untitled Case";
    const notes = typeof body.notes === "string" ? body.notes : "";

    const caseId = `case_${crypto.randomBytes(12).toString("hex")}`;
    const newCase = await saveCaseRecord(caseId, {
      id: caseId,
      ownerUid: uid,
      title,
      notes,
      captureIds: [],
    });

    return NextResponse.json({ success: true, case: newCase }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
