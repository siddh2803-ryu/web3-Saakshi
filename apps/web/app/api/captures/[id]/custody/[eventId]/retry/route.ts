import { NextRequest, NextResponse } from "next/server";
import {
  getCaptureRecord,
  listCustodyEvents,
  updateCustodyEventTxHash,
} from "@/lib/firebase/admin";
import { logCustodyOnChain } from "@/lib/chain/registry";
import { toBytes32 } from "@/lib/evidence/hash";
import { requireAuth, requireOwner } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; eventId: string } }
) {
  try {
    const auth = requireAuth(req);
    if ("response" in auth) return auth.response;

    const { id: captureId, eventId } = params;
    const capture = await getCaptureRecord(captureId);

    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    const authError = requireOwner(auth.user.uid, capture.ownerUid);
    if (authError) return authError;

    const events = await listCustodyEvents(captureId, "asc");
    const target = events.find((e) => e.id === eventId);

    if (!target) {
      return NextResponse.json({ error: "Custody event not found" }, { status: 404 });
    }

    if (target.txHash) {
      return NextResponse.json({
        success: true,
        message: "Custody event already has an on-chain transaction",
        txHash: target.txHash,
      });
    }

    if (target.action !== "EXPORT" && target.action !== "SHARE") {
      return NextResponse.json(
        { error: `Event action "${target.action}" does not require on-chain logging.` },
        { status: 400 }
      );
    }

    const actionCode = target.action === "EXPORT" ? 1 : 2;
    const manifestBytes32 =
      capture.manifestBytes32 ||
      (capture.manifestSha256 ? toBytes32(capture.manifestSha256) : null);

    if (!manifestBytes32) {
      return NextResponse.json(
        { error: "Capture manifest hash is missing or not yet sealed." },
        { status: 400 }
      );
    }

    const actionHash = (target.eventHash.startsWith("0x")
      ? target.eventHash
      : `0x${target.eventHash}`) as `0x${string}`;

    const txHash = await logCustodyOnChain(manifestBytes32, actionHash, actionCode);

    if (!txHash) {
      return NextResponse.json(
        {
          success: false,
          error: "On-chain transaction could not be broadcast. Anchor private key or registry contract may not be configured.",
        },
        { status: 502 }
      );
    }

    await updateCustodyEventTxHash(captureId, target.id, txHash);

    return NextResponse.json({
      success: true,
      txHash,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
