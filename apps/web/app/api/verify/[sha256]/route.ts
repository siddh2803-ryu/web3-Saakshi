import { NextRequest, NextResponse } from "next/server";
import { getPublicProof, recordCustodyEvent } from "@/lib/firebase/admin";
import { checkSharedRateLimit, rateLimitExceededResponse, getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { sha256: string } }
) {
  try {
    const ip = getClientIp(req);
    const rl = await checkSharedRateLimit({
      action: "verify_lookup",
      identifier: ip,
      limit: 60,
      windowSeconds: 60,
    });
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl.retryAfter);
    }

    const rawSha256 = params.sha256;
    if (!rawSha256) {
      return NextResponse.json({ error: "SHA-256 hash required" }, { status: 400 });
    }

    const cleanHash = (rawSha256.startsWith("0x") ? rawSha256.slice(2) : rawSha256).toLowerCase();

    // Validate 64-hex character hash
    if (!/^[0-9a-f]{64}$/.test(cleanHash)) {
      return NextResponse.json(
        { error: "Invalid SHA-256 format. Expected 64 hexadecimal characters." },
        { status: 400 }
      );
    }

    const proof = await getPublicProof(cleanHash);

    if (!proof) {
      return NextResponse.json({
        found: false,
        message: "Not found in Saakshi's records. This file was not captured by Saakshi, or it has been changed.",
      });
    }

    if (proof && proof.captureId) {
      recordCustodyEvent({
        captureId: proof.captureId,
        action: "VERIFY",
        actorId: "verifier",
        details: { matchedSha256: cleanHash },
      }).catch((e) => console.warn("Could not record VERIFY custody event:", e));
    }

    return NextResponse.json({
      found: true,
      proof,
    });
  } catch (err: unknown) {
    console.error("GET /api/verify/[sha256] error:", err);
    const msg =
      process.env.NODE_ENV === "production"
        ? "Failed to process verification lookup."
        : err instanceof Error
        ? err.message
        : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
