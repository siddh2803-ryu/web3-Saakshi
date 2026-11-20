import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getCaptureRecord,
  saveShareRecord,
  recordCustodyEvent,
  updateCustodyEventTxHash,
} from "@/lib/firebase/admin";
import {
  generateShareToken,
  calculateExpiryDate,
  ShareDuration,
  ShareRecord,
} from "@/lib/share/model";
import { logCustodyOnChain } from "@/lib/chain/registry";
import { requireAuth, requireOwner } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ("response" in auth) return auth.response;

    const body = await req.json();
    const { captureId, duration = "7d", includeAi = false } = body;
    const uid = auth.user.uid;

    const capture = await getCaptureRecord(captureId);
    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    const authError = requireOwner(auth.user.uid, capture.ownerUid);
    if (authError) return authError;

    const { rawToken, tokenHash } = generateShareToken();
    const expiresAt = calculateExpiryDate(duration as ShareDuration).toISOString();
    const shareId = `sh_${crypto.randomBytes(16).toString("hex")}`;

    const shareRecord: ShareRecord = {
      id: shareId,
      captureId,
      ownerUid: uid,
      tokenHash,
      expiresAt,
      includeAi: Boolean(includeAi),
      revoked: false,
      createdAt: new Date().toISOString(),
    };

    await saveShareRecord(shareRecord);

    // Log SHARE Custody Event (FR-13.1 & FR-13.2)
    const custodyEvent = await recordCustodyEvent({
      captureId,
      action: "SHARE",
      actorId: uid,
      details: { shareId, duration, expiresAt, includeAi: shareRecord.includeAi },
    });

    if (capture.manifestBytes32) {
      const actionHash = (custodyEvent.eventHash.startsWith("0x")
        ? custodyEvent.eventHash
        : `0x${custodyEvent.eventHash}`) as `0x${string}`;

      logCustodyOnChain(capture.manifestBytes32, actionHash, 2)
        .then(async (txHash) => {
          if (txHash) {
            await updateCustodyEventTxHash(captureId, custodyEvent.id, txHash);
          }
        })
        .catch((e) => console.warn("On-chain share custody log error:", e));
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const shareUrl = `${appUrl.replace(/\/$/, "")}/s/${rawToken}`;

    return NextResponse.json({
      success: true,
      token: rawToken,
      shareId,
      shareUrl,
      expiresAt,
      includeAi: shareRecord.includeAi,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
