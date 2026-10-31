import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function runLiveIpfsCheck() {
  console.log("=== Phase 3: Real IPFS Storage Live Verification ===");

  const jwt = process.env.PINATA_JWT;
  if (!jwt || jwt.trim() === "") {
    console.log("\n⚠️  STATUS: PENDING - Real IPFS storage verification requires PINATA_JWT in .env.local.");
    console.log("--------------------------------------------------------------------------------");
    console.log("1. Add PINATA_JWT to .env.local (do not print or commit it).");
    console.log("2. Run: npx ts-node -r tsconfig-paths/register scripts/live-ipfs-check.ts");
    console.log("--------------------------------------------------------------------------------\n");
    process.exit(0);
  }

  const { PinataSDK } = await import("pinata");
  const { uploadBufferToIpfs, getPinataFileCount, unpinFromIpfs } = await import(
    "../apps/web/lib/evidence/ipfs"
  );
  const { generateDek, encryptWithKey, decryptWithKey, wrapDek, unwrapDek } = await import(
    "../apps/web/lib/evidence/crypto"
  );
  const { computeSha256 } = await import("../apps/web/lib/evidence/hash");
  const { runFinalizePipeline } = await import("../apps/web/lib/pipeline/finalize");
  const {
    saveCaptureRecord,
    getCaptureRecord,
    listArtifactRecords,
  } = await import("../apps/web/lib/firebase/admin");
  const { buildEvidenceBundleZip } = await import("../apps/web/lib/evidence/bundle");

  const gateway = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";
  console.log(`Pinata Gateway: ${gateway}`);

  // 1. Check existing Saakshi file count against 500 free-tier limit
  const count = await getPinataFileCount();
  console.log(`Current file count in Pinata account: ${count} / 500 files`);

  // 2. Encrypt, upload, download, decrypt round-trip with real IPFS
  console.log("\n1. Testing round-trip with live encrypted test artifact...");
  const dek = generateDek();
  const testPlaintext = Buffer.from(
    `Saakshi Live Verification Artifact created at ${new Date().toISOString()}`
  );
  const expectedSha256 = computeSha256(testPlaintext);
  const testCaptureId = `cap_live_test_${Date.now()}`;
  const testAad = `${testCaptureId}:art_roundtrip`;

  const encrypted = encryptWithKey(testPlaintext, dek, testAad);
  console.log(`- Ciphertext size: ${encrypted.ciphertext.length} bytes`);

  const uploadResult = await uploadBufferToIpfs(encrypted.ciphertext, {
    name: `saakshi_${testCaptureId}_art_roundtrip.enc`,
    captureId: testCaptureId,
    kind: "live_test_artifact",
  });

  console.log(`- Uploaded to IPFS. CID: ${uploadResult.cid}`);
  console.log(`- Pinata File ID: ${uploadResult.pinataFileId || "n/a"}`);
  console.log(`- Is fallback: ${uploadResult.isFallback}`);

  if (uploadResult.isFallback) {
    console.error("❌ ERROR: Upload returned fallback CID instead of real IPFS CID.");
    process.exit(1);
  }

  // Download ciphertext back from gateway
  console.log(`- Fetching from gateway: ${gateway}/${uploadResult.cid}...`);
  const gwRes = await fetch(`${gateway}/${uploadResult.cid}`);
  if (!gwRes.ok) {
    console.error(`❌ Gateway retrieval failed with HTTP ${gwRes.status}`);
    process.exit(1);
  }

  const downloadedBytes = Buffer.from(await gwRes.arrayBuffer());
  console.log(`- Downloaded ${downloadedBytes.length} bytes from gateway.`);

  // Verify it is ciphertext (does NOT contain plaintext)
  if (downloadedBytes.toString("utf8").includes("Saakshi Live Verification Artifact")) {
    console.error("❌ ERROR: Downloaded file contains plaintext! Public IPFS must only store ciphertext.");
    process.exit(1);
  }
  console.log("✅ Verified: Gateway payload is ciphertext, not plaintext.");

  // Decrypt
  const decrypted = decryptWithKey(
    downloadedBytes,
    dek,
    encrypted.ivHex,
    encrypted.authTagHex,
    testAad
  );
  const decryptedSha256 = computeSha256(decrypted);

  if (decryptedSha256 !== expectedSha256) {
    console.error(`❌ Hash mismatch! Expected ${expectedSha256}, got ${decryptedSha256}`);
    process.exit(1);
  }
  console.log(`✅ Decrypted successfully. SHA-256 matches: ${decryptedSha256}`);

  // Unpin test file
  if (uploadResult.pinataFileId) {
    console.log("- Unpinning test artifact...");
    await unpinFromIpfs(uploadResult.pinataFileId);
    console.log("✅ Test artifact unpinned.");
  }

  // 3. Re-run finalize for a live capture to test complete pipeline with real IPFS
  console.log("\n2. Re-running finalize for capture to verify real IPFS pipeline...");
  const liveCapId = `cap_live_ipfs_${Date.now()}`;
  await saveCaptureRecord(liveCapId, {
    id: liveCapId,
    ownerUid: "live_test_user",
    url: "https://chirp.local/sandbox/post/internship-scam-alert",
    finalUrl: "https://chirp.local/sandbox/post/internship-scam-alert",
    goal: "Verify live IPFS evidence engine",
    mode: "standard",
    status: "AGENT_DONE",
    tinyfish: { runId: "live_fixture_run", startedAt: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const finOk = await runFinalizePipeline(liveCapId);
  if (!finOk) {
    console.error("❌ Finalize pipeline failed for live capture.");
    process.exit(1);
  }

  const finalRecord = await getCaptureRecord(liveCapId);
  console.log(`- Finalize status: ${finalRecord.status}`);
  console.log(`- Manifest CID (ciphertext): ${finalRecord.manifestCid}`);
  console.log(`- Is fallback: ${finalRecord.isFallbackCid}`);

  if (finalRecord.isFallbackCid) {
    console.error("❌ Pipeline used fallback CIDs instead of live Pinata IPFS!");
    process.exit(1);
  }

  // 4. Download and run check-bundle on the generated bundle
  console.log("\n3. Testing bundle generation and scripted check-bundle...");
  const artifacts = await listArtifactRecords(liveCapId);
  const unwrappedDek = unwrapDek(finalRecord.wrappedDek);

  const bundleEntries = [];
  for (const art of artifacts) {
    const artRes = await fetch(`${gateway}/${art.cid}`);
    if (!artRes.ok) throw new Error(`Failed to fetch artifact ${art.id} from gateway`);
    const ct = Buffer.from(await artRes.arrayBuffer());
    const pt = decryptWithKey(ct, unwrappedDek, art.iv, art.authTag, `${liveCapId}:${art.id}`);
    bundleEntries.push({
      filename: `${art.id}_${art.kind}.bin`,
      plaintextBuffer: pt,
      sha256: art.sha256,
    });
  }

  const zipBuf = await buildEvidenceBundleZip({
    manifest: finalRecord.manifest,
    artifacts: bundleEntries,
    aiAnalysisJson: finalRecord.aiAnalysis,
  });

  const bundlePath = path.resolve(process.cwd(), `bundle_${liveCapId}.zip`);
  fs.writeFileSync(bundlePath, zipBuf);
  console.log(`Saved bundle to: ${bundlePath}`);

  // Run check-bundle
  const { execSync } = await import("child_process");
  const checkOut = execSync(`npx ts-node -r tsconfig-paths/register scripts/check-bundle.ts "${bundlePath}"`, {
    encoding: "utf8",
  });
  console.log(checkOut);

  // Clean up zip
  fs.unlinkSync(bundlePath);

  console.log("\n🎉 ALL LIVE IPFS CHECKS PASSED!");
}

runLiveIpfsCheck().catch((err) => {
  console.error("Live IPFS verification error:", err);
  process.exit(1);
});
