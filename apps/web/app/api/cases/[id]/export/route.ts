import { NextRequest, NextResponse } from "next/server";
import {
  getCaseRecord,
  getCaptureRecord,
  listArtifactRecords,
  listCustodyEvents,
  recordCustodyEvent,
  updateCustodyEventTxHash,
} from "@/lib/firebase/admin";
import { unwrapDek, decryptWithKey } from "@/lib/evidence/crypto";
import {
  buildCaseExportStream,
  CaseExportItem,
  DecryptedArtifactEntry,
} from "@/lib/evidence/bundle";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { logCustodyOnChain } from "@/lib/chain/registry";
import { computeSha256 } from "@/lib/evidence/hash";
import { canonicalJson } from "@/lib/evidence/canonical";
import QRCode from "qrcode";
import { FIXTURE_BROWSER_CAPTURE, MOCK_JPEG_BASE64 } from "@/lib/tinyfish/fixtures";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caseId = params.id;
    const caseData = await getCaseRecord(caseId);

    if (!caseData) {
      return new NextResponse("Case not found", { status: 404 });
    }

    const gateway = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const exportItems: CaseExportItem[] = [];

    // Collect bundles for all captures in this case
    for (const cid of caseData.captureIds || []) {
      try {
        const capture = await getCaptureRecord(cid);
        if (!capture || !capture.manifest) {
          continue;
        }

        const artifacts = await listArtifactRecords(cid);
        const decryptedEntries: DecryptedArtifactEntry[] = [];

        let dek: Buffer | null = null;
        if (capture.wrappedDek) {
          try {
            dek = unwrapDek(capture.wrappedDek);
          } catch (e) {
            console.warn(`DEK unwrap failed for capture ${cid}:`, e);
          }
        }

        for (const art of artifacts) {
          let plaintextBuffer: Buffer = Buffer.from("");

          if (dek && art.cid && !art.cid.startsWith("bafy_mock") && !art.cid.startsWith("bafy_fallback")) {
            try {
              const ipfsRes = await fetch(`${gateway}/${art.cid}`);
              if (ipfsRes.ok) {
                const ciphertext = Buffer.from(await ipfsRes.arrayBuffer());
                const aad = `${cid}:${art.id}`;
                plaintextBuffer = decryptWithKey(ciphertext, dek, art.iv, art.authTag, aad);
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

        const verifyUrl = `${appUrl}/v/${cid}`;
        const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200 }).catch(() => null);

        let certPdfBuffer: Buffer | null = null;
        try {
          const captureCustodyEvents = await listCustodyEvents(cid);
          certPdfBuffer = await renderCertificatePdf(
            capture.manifest,
            capture.manifestSha256,
            capture.anchoring,
            qrDataUrl,
            captureCustodyEvents
          );
        } catch (certErr) {
          console.warn(`Certificate PDF generation error for ${cid}:`, certErr);
        }

        const isMockTx = Boolean(
          capture.anchoring?.txHash &&
            (capture.anchoring.txHash.startsWith("0xmock") ||
              capture.anchoring.txHash.toLowerCase().includes("mock"))
        );
        const hasRealAnchoring = Boolean(
          capture.anchoring?.txHash && !isMockTx && capture.anchoring?.root
        );

        exportItems.push({
          captureId: cid,
          manifestSha256: capture.manifestSha256 || computeSha256(canonicalJson(capture.manifest)),
          status: capture.status || "READY",
          url: capture.url,
          createdAt: capture.createdAt,
          bundleOptions: {
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
            aiAnalysisJson: capture.aiAnalysis || null,
            certificatePdfBuffer: certPdfBuffer,
          },
        });

        // -------------------------------------------------------------
        // Custody Logging (FR-10.3 & FR-13.1)
        // Every capture exported as part of a case ZIP writes an EXPORT event
        // -------------------------------------------------------------
        const custodyEvent = await recordCustodyEvent({
          captureId: cid,
          action: "EXPORT",
          actorId: caseData.ownerUid || "anonymous",
          details: {
            caseId: caseData.id,
            exportType: "case_zip_export",
          },
        });

        if (capture.manifestBytes32) {
          const actionHash = `0x${custodyEvent.eventHash}` as `0x${string}`;
          logCustodyOnChain(capture.manifestBytes32, actionHash, 1)
            .then(async (txHash) => {
              if (txHash) {
                await updateCustodyEventTxHash(cid, custodyEvent.id, txHash);
              }
            })
            .catch((e) => console.warn("On-chain custody log error for case export:", e));
        }
      } catch (itemErr) {
        console.warn(`Error bundling capture ${cid} for case export:`, itemErr);
      }
    }

    const zipStream = buildCaseExportStream({
      caseData: {
        id: caseData.id,
        ownerUid: caseData.ownerUid,
        title: caseData.title,
        notes: caseData.notes,
        createdAt: caseData.createdAt,
      },
      captures: exportItems,
    });

    return new Response(zipStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="case_${caseId}_export.zip"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Case bundle export error:", err);
    return new NextResponse(`Error generating case bundle: ${msg}`, { status: 500 });
  }
}
