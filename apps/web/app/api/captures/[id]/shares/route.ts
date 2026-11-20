import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getCaptureRecord,
  saveShareRecord,
  listCaptureShares,
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

    const shares = await listCaptureShares(captureId);
    // Sanitize: never return tokenHash or secrets
    const sanitized = shares.map((s) => ({
      id: s.id,
      captureId: s.captureId,
      expiresAt: s.expiresAt,
      includeAi: Boolean(s.includeAi),
      revoked: Boolean(s.revoked),
      revokedAt: s.revokedAt || null,
      createdAt: s.createdAt,
    }));

    return NextResponse.json({ success: true, shares: sanitized });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
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

    const body = await req.json().catch(() => ({}));
    const duration = (body.duration || "7d") as ShareDuration;
    const includeAi = Boolean(body.includeAi);
    const ownerUid = auth.user.uid;

    // 1. Generate 32-byte cryptographic random token
    const { rawToken, tokenHash } = generateShareToken();
    const expiresAt = calculateExpiryDate(duration).toISOString();
    const shareId = `sh_${crypto.randomBytes(16).toString("hex")}`;

    const shareRecord: ShareRecord = {
      id: shareId,
      captureId,
      ownerUid,
      tokenHash,
      expiresAt,
      includeAi,
      revoked: false,
      createdAt: new Date().toISOString(),
    };

    // 2. Persist to database (strictly storing tokenHash, never rawToken)
    await saveShareRecord(shareRecord);

    // 3. Record SHARE custody event
    const custodyEvent = await recordCustodyEvent({
      captureId,
      action: "SHARE",
      actorId: ownerUid,
      details: {
        shareId,
        duration,
        expiresAt,
        includeAi,
      },
    });

    // 4. On-chain custody event emission (actionCode 2: SHARE)
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
    const fullShareUrl = `${appUrl.replace(/\/$/, "")}/s/${rawToken}`;

    return NextResponse.json({
      success: true,
      share: {
        id: shareId,
        expiresAt,
        includeAi,
        url: fullShareUrl,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
