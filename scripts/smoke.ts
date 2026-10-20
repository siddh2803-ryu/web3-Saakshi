import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { startAgentRun, getAgentRun } from "../apps/web/lib/tinyfish/agent";
import { runFinalizePipeline } from "../apps/web/lib/pipeline/finalize";
import { saveCaptureRecord, getCaptureRecord, listArtifactRecords, savePublicProof } from "../apps/web/lib/firebase/admin";
import { buildMerkleBatch, verifyManifestProof } from "../apps/web/lib/evidence/merkle";
import { anchorRootOnChain } from "../apps/web/lib/chain/registry";

/**
 * End-to-End Smoke Test Script
 * Executes full pipeline from capture to anchoring to verification.
 */
async function runSmokeTest() {
  console.log("==================================================");
  console.log("SAAKSHI LIVE SMOKE TEST (END-TO-END PIPELINE)");
  console.log("==================================================\n");

  const captureId = `cap_smoke_${Date.now()}`;
  const targetUrl = "https://chirp.local/sandbox/post/internship-scam-alert";

  console.log(`[1] Initiating capture for target: ${targetUrl}`);
  await saveCaptureRecord(captureId, {
    id: captureId,
    ownerUid: "smoke-tester",
    url: targetUrl,
    finalUrl: targetUrl,
    goal: "Smoke test verification",
    mode: "standard",
    status: "AGENT_RUNNING",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const run = await startAgentRun({
    url: targetUrl,
    userGoal: "Capture post for smoke test",
  });
  console.log(`    Agent Run ID: ${run.run_id}`);

  console.log(`\n[2] Executing Finalize Pipeline (Artifacts, Encryption, IPFS, Manifest)...`);
  const finalized = await runFinalizePipeline(captureId);
  if (!finalized) {
    throw new Error("Finalize pipeline returned false");
  }
  console.log(`    ✅ Pipeline finalized successfully`);

  const capture = await getCaptureRecord(captureId);
  const artifacts = await listArtifactRecords(captureId);

  console.log(`    Status: ${capture.status}`);
  console.log(`    Manifest SHA-256: ${capture.manifestSha256}`);
  console.log(`    Artifacts Preserved: ${artifacts.length}`);

  console.log(`\n[3] Building Merkle Batch & Anchoring...`);
  const batch = buildMerkleBatch([capture.manifestSha256]);
  const proof = batch.getProofForManifest(capture.manifestSha256);
  console.log(`    Merkle Root: ${batch.root}`);

  const anchorTx = await anchorRootOnChain(batch.root, batch.size, "bafysmoketest");
  console.log(`    ✅ Transaction Hash: ${anchorTx.txHash}`);
  console.log(`    Block Number: ${anchorTx.blockNumber}`);

  console.log(`\n[4] Cryptographic Inclusion Verification...`);
  const isProofValid = verifyManifestProof(batch.root, capture.manifestSha256, proof);
  if (!isProofValid) {
    throw new Error("Merkle proof verification failed!");
  }
  console.log(`    ✅ Merkle Proof Verified in JavaScript!`);

  console.log(`\n==================================================`);
  console.log("🎉 SMOKE TEST PASSED ALL CHECKS!");
  console.log("==================================================\n");
}

runSmokeTest().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  process.exit(1);
});
