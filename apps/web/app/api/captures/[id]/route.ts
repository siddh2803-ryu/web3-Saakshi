import { NextRequest, NextResponse } from "next/server";
import {
  getCaptureRecord,
  listArtifactRecords,
  saveCaptureRecord,
  logCustodyEvent,
} from "@/lib/firebase/admin";
import { getAgentRun } from "@/lib/tinyfish/agent";
import { runFinalizePipeline } from "@/lib/pipeline/finalize";
import { unpinFromIpfs } from "@/lib/evidence/ipfs";
import { computeSha256 } from "@/lib/evidence/hash";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const captureId = params.id;
    const capture = await getCaptureRecord(captureId);

    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    // While agent is running, poll TinyFish agent status
    if (capture.status === "AGENT_RUNNING" && capture.tinyfish?.runId) {
      try {
        const run = await getAgentRun(capture.tinyfish.runId, false);

        const updates: Record<string, unknown> = {
          tinyfish: {
            ...capture.tinyfish,
            streamingUrl: run.streaming_url,
            numOfSteps: run.num_of_steps,
          },
        };

        if (run.status === "COMPLETED") {
          // Agent completed! Trigger finalize asynchronously if not already triggered
          saveCaptureRecord(captureId, updates);
          // Run finalize without blocking this request
          runFinalizePipeline(captureId).catch((err) =>
            console.error("Async finalize execution error:", err)
          );
        } else if (run.status === "FAILED" || run.status === "CANCELLED") {
          updates.status = "FAILED";
          updates.error = {
            stage: "AGENT_RUNNING",
            message: run.error || `Agent ended with status: ${run.status}`,
            at: new Date().toISOString(),
          };
          await saveCaptureRecord(captureId, updates);
        } else {
          await saveCaptureRecord(captureId, updates);
        }

        // Merge latest updates into returned object
        Object.assign(capture, updates);
      } catch (pollErr) {
        console.warn("Status poll error from TinyFish:", pollErr);
      }
    }

    const artifacts = await listArtifactRecords(captureId);

    return NextResponse.json({
      capture: {
        ...capture,
        artifacts,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/captures/:id - FR-5.5 Crypto-shredding:
 * Permanently removes the wrapped DEK (so ciphertext can never be decrypted again)
 * and unpins associated files from IPFS. On-chain hashes remain unaltered.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const captureId = params.id;
    const capture = await getCaptureRecord(captureId);

    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    const artifacts = await listArtifactRecords(captureId);

    // 1. Unpin artifacts from Pinata IPFS
    for (const art of artifacts) {
      if (art.pinataFileId) {
        await unpinFromIpfs(art.pinataFileId);
      } else if (art.cid && !art.cid.startsWith("bafy_mock") && !art.cid.startsWith("bafy_fallback")) {
        await unpinFromIpfs(art.cid);
      }
    }

    // 2. Unpin manifest if pinned
    if (capture.manifestPinataFileId) {
      await unpinFromIpfs(capture.manifestPinataFileId);
    } else if (capture.manifestCid && !capture.manifestCid.startsWith("bafy_mock") && !capture.manifestCid.startsWith("bafy_fallback")) {
      await unpinFromIpfs(capture.manifestCid);
    }
    if (capture.publicManifestCid) {
      await unpinFromIpfs(capture.publicManifestCid);
    }

    // 3. Crypto-shredding: Destroy the wrapped DEK permanently
    await saveCaptureRecord(captureId, {
      status: "DELETED",
      wrappedDek: null, // Key permanently shredded
      updatedAt: new Date().toISOString(),
    });

    // 4. Log custody event
    const actorHash = computeSha256(capture.ownerUid || "anonymous");
    await logCustodyEvent({
      id: `custody_${Date.now()}_delete`,
      captureId,
      action: "DELETE",
      actorHash,
      at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Capture crypto-shredded: encryption key permanently destroyed and IPFS files unpinned.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Capture deletion/crypto-shred error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
