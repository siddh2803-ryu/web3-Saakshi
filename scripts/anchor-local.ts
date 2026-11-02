import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.chain-local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { computeSha256 } from "../apps/web/lib/evidence/hash";
import { canonicalJson } from "../apps/web/lib/evidence/canonical";
import { computeManifestSha256, EvidenceManifest } from "../apps/web/lib/evidence/manifest";
import { buildMerkleBatch, verifyManifestProof } from "../apps/web/lib/evidence/merkle";
import { anchorRootOnChain } from "../apps/web/lib/chain/registry";
import { buildEvidenceBundleStream, BundleProofJson } from "../apps/web/lib/evidence/bundle";
import { saveCaptureRecord, savePublicProof, getPublicProof } from "../apps/web/lib/firebase/admin";
import JSZip from "jszip";

async function main() {
  console.log("=== Creating and Anchoring Local Evidence Capture ===");

  const tmpDir = path.resolve(__dirname, "../tmp");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const captureId = `cap_local_${Date.now()}`;
  const targetUrl = "https://chirp.local/sandbox/post/internship-scam-alert";

  // Create sample artifacts with known content
  const screenshotBuf = Buffer.from("PNG_SAMPLE_SCREENSHOT_DATA_SAAKSHI_EVIDENCE_FOR_LEGAL_VERIFICATION_2026");
  const pdfBuf = Buffer.from("PDF_SAMPLE_DOCUMENT_FOR_VERIFICATION_EVIDENCE_INDIAN_EVIDENCE_ACT_BSA_2023");
  const htmlBuf = Buffer.from("<html><body><h1>Urgent Internship Alert</h1><p>Scam warning text</p></body></html>");

  const screenshotHash = computeSha256(screenshotBuf);
  const pdfHash = computeSha256(pdfBuf);
  const htmlHash = computeSha256(htmlBuf);

  const manifest: EvidenceManifest = {
    schema: "saakshi.evidence/v1",
    captureId,
    previousCaptureId: null,
    requester: {
      uidHash: "local_tester_uid_hash",
    },
    target: {
      url: targetUrl,
      finalUrl: targetUrl,
      goal: "Preserve scam alert publication for cyber cell complaint",
      mode: "standard",
    },
    time: {
      serverStartedAt: new Date(Date.now() - 5000).toISOString(),
      serverFinishedAt: new Date().toISOString(),
    },
    tools: {
      saakshiVersion: "1.0.0",
      gitCommit: "local",
      tinyfish: {
        agentRunId: "local_run",
      },
    },
    observed: {
      title: "Urgent Internship Scam Alert",
      author: "@alert_desk",
      contentHash: htmlHash,
    },
    artifacts: [
      {
        id: "art_screenshot_fullpage",
        kind: "fullpage_screenshot",
        mime: "image/png",
        bytes: screenshotBuf.length,
        sha256: screenshotHash,
        cid: "bafy_mock_screenshot_cid",
        capturedAt: new Date().toISOString(),
      },
      {
        id: "art_pdf_export",
        kind: "page_pdf",
        mime: "application/pdf",
        bytes: pdfBuf.length,
        sha256: pdfHash,
        cid: "bafy_mock_pdf_cid",
        capturedAt: new Date().toISOString(),
      },
      {
        id: "art_dom_html",
        kind: "dom_html",
        mime: "text/html",
        bytes: htmlBuf.length,
        sha256: htmlHash,
        cid: "bafy_mock_html_cid",
        capturedAt: new Date().toISOString(),
      },
    ],
    hashAlgorithm: "SHA-256",
    encryption: "AES-256-GCM (cid refers to ciphertext; sha256 refers to plaintext)",
  };

  const { manifestSha256 } = computeManifestSha256(manifest);
  console.log(`Manifest SHA-256: ${manifestSha256}`);

  // Build Merkle Tree
  const batch = buildMerkleBatch([manifestSha256]);
  const proof = batch.getProofForManifest(manifestSha256);
  console.log(`Merkle Root: ${batch.root}`);

  // Anchor on Local Hardhat Chain
  console.log(`Anchoring on local chain via RPC: ${process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL}...`);
  const anchorTx = await anchorRootOnChain(batch.root, batch.size, "bafy_batch_cid_local");
  console.log(`✅ Anchored on-chain!`);
  console.log(`   TxHash: ${anchorTx.txHash}`);
  console.log(`   BlockNumber: ${anchorTx.blockNumber}`);
  console.log(`   Timestamp: ${anchorTx.anchoredAt}`);
  console.log(`   Contract: ${anchorTx.contract}`);
  console.log(`   ChainId: ${anchorTx.chainId}`);

  const proofJson: BundleProofJson = {
    chainId: anchorTx.chainId,
    network: "local",
    contract: anchorTx.contract,
    txHash: anchorTx.txHash,
    blockNumber: anchorTx.blockNumber,
    anchoredAt: anchorTx.anchoredAt,
    root: batch.root,
    manifestSha256,
    proof,
    treeFormat: "openzeppelin-standard-v1",
    leafEncoding: ["bytes32"],
    batchCid: "bafy_batch_cid_local",
  };

  // Save to publicProofs index
  await savePublicProof(manifestSha256, {
    captureId,
    kind: "manifest",
    ...proofJson,
  });

  await savePublicProof(screenshotHash, {
    captureId,
    artifactId: "art_screenshot_fullpage",
    kind: "fullpage_screenshot",
    ...proofJson,
  });

  await savePublicProof(pdfHash, {
    captureId,
    artifactId: "art_pdf_export",
    kind: "page_pdf",
    ...proofJson,
  });

  await savePublicProof(htmlHash, {
    captureId,
    artifactId: "art_dom_html",
    kind: "dom_html",
    ...proofJson,
  });

  // Save capture record
  await saveCaptureRecord(captureId, {
    id: captureId,
    url: targetUrl,
    finalUrl: targetUrl,
    goal: "Preserve scam alert publication for cyber cell complaint",
    status: "ANCHORED",
    createdAt: new Date().toISOString(),
    manifest,
    manifestSha256,
    anchoring: proofJson,
  });

  // Build ZIP bundle stream
  const artifacts = [
    {
      filename: "art_screenshot_fullpage.png",
      plaintextBuffer: screenshotBuf,
      sha256: screenshotHash,
    },
    {
      filename: "art_pdf_export.pdf",
      plaintextBuffer: pdfBuf,
      sha256: pdfHash,
    },
    {
      filename: "art_dom_html.html",
      plaintextBuffer: htmlBuf,
      sha256: htmlHash,
    },
  ];

  const stream = buildEvidenceBundleStream({
    manifest,
    artifacts,
    proofJson,
    aiAnalysisJson: {
      summary: "Alleged fraudulent hiring post targeting students",
      disclaimer: "AI-generated summary. Not legal advice.",
    },
  });

  const response = new Response(stream);
  const zipArrayBuf = await response.arrayBuffer();
  const zipBuf = Buffer.from(zipArrayBuf);

  const bundlePath = path.join(tmpDir, "test_bundle.zip");
  fs.writeFileSync(bundlePath, zipBuf);
  console.log(`✅ Saved test bundle to ${bundlePath} (${zipBuf.length} bytes)`);

  // Save individual unzipped original files for single-file testing
  fs.writeFileSync(path.join(tmpDir, "original_screenshot.png"), screenshotBuf);
  fs.writeFileSync(path.join(tmpDir, "original_pdf.pdf"), pdfBuf);

  // Create a 1-byte tampered copy of screenshot for single-file tamper testing
  const tamperedScreenshotBuf = Buffer.from(screenshotBuf);
  tamperedScreenshotBuf[0] = tamperedScreenshotBuf[0] ^ 0x01; // flip 1 bit / change 1 byte
  fs.writeFileSync(path.join(tmpDir, "tampered_screenshot.png"), tamperedScreenshotBuf);

  // Create an unrelated file
  const unrelatedBuf = Buffer.from("COMPLETELY_UNRELATED_FILE_NEVER_SEEN_BY_SAAKSHI");
  fs.writeFileSync(path.join(tmpDir, "unrelated_file.txt"), unrelatedBuf);

  // Create a tampered ZIP bundle (altering 1 artifact inside the zip)
  const zipLoaded = await JSZip.loadAsync(zipBuf);
  zipLoaded.file("artifacts/art_screenshot_fullpage.png", tamperedScreenshotBuf);
  const tamperedZipBuf = await zipLoaded.generateAsync({ type: "nodebuffer" });
  const tamperedBundlePath = path.join(tmpDir, "tampered_bundle.zip");
  fs.writeFileSync(tamperedBundlePath, tamperedZipBuf);
  console.log(`✅ Saved tampered bundle to ${tamperedBundlePath} (${tamperedZipBuf.length} bytes)`);

  // Write capture metadata to tmp/capture_meta.json for easy test inspection
  fs.writeFileSync(
    path.join(tmpDir, "capture_meta.json"),
    JSON.stringify(
      {
        captureId,
        manifestSha256,
        screenshotHash,
        tamperedScreenshotHash: computeSha256(tamperedScreenshotBuf),
        pdfHash,
        htmlHash,
        proofJson,
      },
      null,
      2
    )
  );

  console.log("=== Setup Complete! ===");
}

main().catch((err) => {
  console.error("Failed to prepare local bundle:", err);
  process.exit(1);
});
