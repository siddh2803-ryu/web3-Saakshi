import { NextRequest, NextResponse } from "next/server";
import { getCaptureRecord, logCustodyEvent } from "@/lib/firebase/admin";
import { computeSha256 } from "@/lib/evidence/hash";
import { canonicalJson } from "@/lib/evidence/canonical";
import { logCustodyOnChain } from "@/lib/chain/registry";

// In-memory / firestore shares store
const globalShares = (global as any).__saakshiShares || new Map<string, any>();
if (typeof global !== "undefined") {
  (global as any).__saakshiShares = globalShares;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { captureId, duration = "7d", uid = "demo-user" } = body;

    const capture = await getCaptureRecord(captureId);
    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    let ms = 7 * 24 * 60 * 60 * 1000; // default 7 days
    if (duration === "24h") ms = 24 * 60 * 60 * 1000;
    if (duration === "30d") ms = 30 * 24 * 60 * 60 * 1000;

    const expiresAt = new Date(Date.now() + ms).toISOString();
    const token = `sh_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;

    const shareData = {
      token,
      captureId,
      createdBy: uid,
      expiresAt,
      revoked: false,
      createdAt: new Date().toISOString(),
    };

    globalShares.set(token, shareData);

    // Log SHARE Custody Event (FR-13.1 & FR-13.2)
    const actorHash = computeSha256(uid);
    const custodyEvent = {
      id: `custody_${Date.now()}_share`,
      captureId,
      action: "SHARE",
      actorHash,
      at: new Date().toISOString(),
    };
    await logCustodyEvent(custodyEvent);

    if (capture.manifestBytes32) {
      const actionPayload = {
        actorHash,
        action: "SHARE",
        at: custodyEvent.at,
        captureId,
      };
      const actionHash = `0x${computeSha256(canonicalJson(actionPayload))}` as `0x${string}`;
      logCustodyOnChain(capture.manifestBytes32, actionHash, 2).catch((e) =>
        console.warn("On-chain share custody log error:", e)
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const shareUrl = `${appUrl}/v/${captureId}?share=${token}`;

    return NextResponse.json({
      success: true,
      token,
      shareUrl,
      expiresAt,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
