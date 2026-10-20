import { NextRequest, NextResponse } from "next/server";
import {
  getCaptureRecord,
  saveCaptureRecord,
  listArtifactRecords,
  savePublicProof,
} from "@/lib/firebase/admin";
import { buildMerkleBatch } from "@/lib/evidence/merkle";
import { uploadJsonToIpfs } from "@/lib/evidence/ipfs";
import { anchorRootOnChain } from "@/lib/chain/registry";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const captureId = params.id;
    const capture = await getCaptureRecord(captureId);

    if (!capture) {
      return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    }

    if (capture.status === "ANCHORED") {
      return NextResponse.json({
        success: true,
        message: "Capture already anchored",
        anchoring: capture.anchoring,
      });
    }

    const manifestSha256 = capture.manifestSha256;
    if (!manifestSha256) {
      return NextResponse.json(
        { error: "Capture has not yet been fingerprinted or finalized" },
        { status: 400 }
      );
    }

    // 1. Build Merkle Tree batch (batch of 1 or pending)
    const batch = buildMerkleBatch([manifestSha256]);
    const proof = batch.getProofForManifest(manifestSha256);

    // 2. Upload Batch Tree Dump to IPFS
    const batchCidResult = await uploadJsonToIpfs(
      batch.treeDump,
      `saakshi_batch_${Date.now()}.json`
    );

    // 3. Anchor Root on Polygon Amoy
    const anchorTx = await anchorRootOnChain(batch.root, batch.size, batchCidResult.cid);

    const anchoringDetails = {
      batchId: `batch_${Date.now()}`,
      root: batch.root,
      proof,
      txHash: anchorTx.txHash,
      blockNumber: anchorTx.blockNumber,
      anchoredAt: anchorTx.anchoredAt,
      chainId: anchorTx.chainId,
      contract: anchorTx.contract,
      batchCid: batchCidResult.cid,
    };

    // 4. Index in publicProofs for trustless public verification (FR-6.5)
    // Index manifest hash
    await savePublicProof(manifestSha256, {
      captureId,
      kind: "manifest",
      manifestSha256,
      root: batch.root,
      proof,
      txHash: anchorTx.txHash,
      blockNumber: anchorTx.blockNumber,
      anchoredAt: anchorTx.anchoredAt,
      chainId: anchorTx.chainId,
      contract: anchorTx.contract,
    });

    // Index all individual artifact hashes
    const artifacts = await listArtifactRecords(captureId);
    for (const art of artifacts) {
      if (art.sha256) {
        await savePublicProof(art.sha256, {
          captureId,
          artifactId: art.id,
          kind: art.kind,
          manifestSha256,
          root: batch.root,
          proof,
          txHash: anchorTx.txHash,
          blockNumber: anchorTx.blockNumber,
          anchoredAt: anchorTx.anchoredAt,
          chainId: anchorTx.chainId,
          contract: anchorTx.contract,
        });
      }
    }

    // 5. Update Capture Record
    await saveCaptureRecord(captureId, {
      status: "ANCHORED",
      anchoring: anchoringDetails,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      anchoring: anchoringDetails,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Anchoring endpoint error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
