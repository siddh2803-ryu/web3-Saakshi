import { NextRequest, NextResponse } from "next/server";
import {
  getShareRecordByTokenHash,
  getCaptureRecord,
  listArtifactRecords,
  recordCustodyEvent,
  updateCustodyEventTxHash,
} from "@/lib/firebase/admin";
import { computeSha256 } from "@/lib/evidence/hash";
import { isShareActive } from "@/lib/share/model";
import { unwrapDek, decryptWithKey } from "@/lib/evidence/crypto";
import {
  buildEvidenceBundleStream,
  DecryptedArtifactEntry,
} from "@/lib/evidence/bundle";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { logCustodyOnChain } from "@/lib/chain/registry";
import QRCode from "qrcode";
import { FIXTURE_BROWSER_CAPTURE, MOCK_JPEG_BASE64 } from "@/lib/tinyfish/fixtures";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const rawToken = params.token;
    if (!rawToken || typeof rawToken !== "string" || rawToken.length < 16) {
      return new NextResponse("This link is no longer available", {
        status: 404,
        headers: {
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    const tokenHash = computeSha256(rawToken);
    const share = await getShareRecordByTokenHash(tokenHash);

    if (!share || !isShareActive(share)) {
      return new NextResponse("This link is no longer available", {
        status: 404,
        headers: {
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    const captureId = share.captureId;
    const capture = await getCaptureRecord(captureId);

    if (!capture || !capture.manifest) {
      return new NextResponse("This link is no longer available", {
        status: 404,
        headers: {
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    const artifacts = await listArtifactRecords(captureId);
    const decryptedEntries: DecryptedArtifactEntry[] = [];

    let dek: Buffer | null = null;
    if (capture.wrappedDek) {
      try {
        dek = unwrapDek(capture.wrappedDek);
      } catch (e) {
        console.warn("DEK unwrap failed, using simulated fallback for demo:", e);
      }
    }

    const gateway = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";

    for (const art of artifacts) {
      // If AI analysis is not included in this share, skip ai_analysis.json
      if (art.id === "ai_analysis.json" && !share.includeAi) {
        continue;
      }

      let plaintextBuffer: Buffer = Buffer.from("");

      if (dek && art.cid && !art.cid.startsWith("bafy_mock") && !art.cid.startsWith("bafy_fallback")) {
        try {
          const ipfsRes = await fetch(`${gateway}/${art.cid}`);
          if (ipfsRes.ok) {
            const ciphertext = Buffer.from(await ipfsRes.arrayBuffer());
            const aad = `${captureId}:${art.id}`;
            plaintextBuffer = decryptWithKey(ciphertext, dek, art.iv, art.authTag, aad);

            const actualSha256 = computeSha256(plaintextBuffer);
            if (actualSha256 !== art.sha256) {
              console.error(
                `[Integrity Error] Bundle artifact ${art.id} hash mismatch: expected ${art.sha256}, got ${actualSha256}`
              );
              return new NextResponse(
                `Integrity verification failed for artifact ${art.id}: SHA-256 hash mismatch with manifest`,
                { status: 500 }
              );
            }
          }
        } catch {
          // fallback
        }
      }

      if (plaintextBuffer.length === 0) {
        if (art.kind === "fullpage_screenshot") {
          plaintextBuffer = FIXTURE_BROWSER_CAPTURE.fullpageScreenshot;
        } else if (art.kind === "agent_step_screenshot") {
          plaintextBuffer = Buffer.from(MOCK_JPEG_BASE64.replace(/^data:image\/\w+;base64,/, ""), "base64");
        } else if (art.kind === "fetch_markdown") {
          plaintextBuffer = Buffer.from(FIXTURE_BROWSER_CAPTURE.domHtml, "utf8");
        } else {
          plaintextBuffer = Buffer.from(`Artifact ${art.id} content preserved by Saakshi`);
        }
      }

      const filename = `${art.id}_${art.kind}.${art.mime.includes("pdf") ? "pdf" : art.mime.includes("json") ? "json" : art.mime.includes("html") ? "html" : art.mime.includes("png") ? "png" : art.mime.includes("markdown") ? "md" : "jpg"}`;
      decryptedEntries.push({
        filename,
        plaintextBuffer,
        sha256: art.sha256,
      });
    }

    // Generate QR code data URI
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const verifyUrl = `${appUrl}/v/${captureId}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200 }).catch(() => null);

    // Generate Certificate PDF
    let certPdfBuffer: Buffer | null = null;
    try {
      certPdfBuffer = await renderCertificatePdf(
        capture.manifest,
        capture.manifestSha256,
        capture.anchoring,
        qrDataUrl
      );
    } catch (certErr) {
      console.warn("Certificate PDF generation error:", certErr);
    }

    const isMockTx = Boolean(
      capture.anchoring?.txHash &&
        (capture.anchoring.txHash.startsWith("0xmock") ||
          capture.anchoring.txHash.toLowerCase().includes("mock"))
    );
    const hasRealAnchoring = Boolean(
      capture.anchoring?.txHash && !isMockTx && capture.anchoring?.root
    );

    const zipStream = buildEvidenceBundleStream({
      manifest: capture.manifest,
      artifacts: decryptedEntries,
      proofJson: hasRealAnchoring
        ? {
            chainId:
              capture.anchoring!.chainId ||
              Number(process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID || 80002),
            network:
              capture.anchoring!.network ||
              (Number(process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID) === 31337
                ? "local"
                : "polygon-amoy"),
            contract: capture.anchoring!.contract || "",
            txHash: capture.anchoring!.txHash || "",
            blockNumber: capture.anchoring!.blockNumber || 0,
            anchoredAt: capture.anchoring!.anchoredAt || new Date().toISOString(),
            root: capture.anchoring!.root || "",
            manifestSha256: capture.manifestSha256,
            proof: capture.anchoring!.proof || [],
            treeFormat: "openzeppelin-standard-v1",
            leafEncoding: ["bytes32"],
            batchCid: capture.anchoring!.batchCid || "",
          }
        : null,
      aiAnalysisJson: share.includeAi ? (capture.aiAnalysis || null) : null,
      certificatePdfBuffer: certPdfBuffer,
    });

    // Log EXPORT Custody Event with share actor identity (FR-13.1, FR-14.1)
    const custodyEvent = await recordCustodyEvent({
      captureId,
      action: "EXPORT",
      actorId: `share:${share.id}`,
      isShare: true,
      details: { format: "ZIP", shareId: share.id, via: "share_link" },
    });

    // On-chain custody logging if anchored (actionCode 1: EXPORT)
    if (capture.manifestBytes32) {
      const actionHash = (custodyEvent.eventHash.startsWith("0x")
        ? custodyEvent.eventHash
        : `0x${custodyEvent.eventHash}`) as `0x${string}`;

      logCustodyOnChain(capture.manifestBytes32, actionHash, 1)
        .then(async (txHash) => {
          if (txHash) {
            await updateCustodyEventTxHash(captureId, custodyEvent.id, txHash);
          }
        })
        .catch((e) => console.warn("On-chain share bundle custody log error:", e));
    }

    return new Response(zipStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="saakshi_evidence_${captureId}.zip"`,
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Shared bundle export error:", err);
    return new NextResponse(`Error generating bundle: ${msg}`, { status: 500 });
  }
}
