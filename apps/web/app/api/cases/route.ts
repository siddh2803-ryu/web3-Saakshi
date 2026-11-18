import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { listUserCases, saveCaseRecord } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid") || "demo-user";
    const cases = await listUserCases(uid);
    return NextResponse.json({ cases });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const uid = body.uid || "demo-user";
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
