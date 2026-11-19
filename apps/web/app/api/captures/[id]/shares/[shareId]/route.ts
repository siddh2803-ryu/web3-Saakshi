import { NextRequest, NextResponse } from "next/server";
import { revokeShareRecord } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; shareId: string } }
) {
  try {
    const { shareId } = params;
    const ok = await revokeShareRecord(shareId);

    if (!ok) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Share link revoked successfully" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
