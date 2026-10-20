import { NextRequest, NextResponse } from "next/server";
import { getPublicProof } from "@/lib/firebase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: { sha256: string } }
) {
  try {
    const rawSha256 = params.sha256;
    if (!rawSha256) {
      return NextResponse.json({ error: "SHA-256 hash required" }, { status: 400 });
    }

    const cleanHash = rawSha256.startsWith("0x") ? rawSha256.slice(2) : rawSha256;
    const proof = await getPublicProof(cleanHash);

    if (!proof) {
      return NextResponse.json({
        found: false,
        message: "No matching anchored artifact or manifest found for this hash.",
      });
    }

    return NextResponse.json({
      found: true,
      proof,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
