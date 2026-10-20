import { describe, it, expect, beforeEach } from "vitest";
import { runFinalizePipeline } from "../lib/pipeline/finalize";
import { saveCaptureRecord, getCaptureRecord, listArtifactRecords } from "../lib/firebase/admin";
import { computeSha256 } from "../lib/evidence/hash";
import { buildEvidenceBundleZip } from "../lib/evidence/bundle";

describe("Capture Pipeline Integration (Fixture Mode)", () => {
  const testCaptureId = "cap_test_pipeline_001";

  beforeEach(async () => {
    process.env.TINYFISH_MODE = "fixture";
    process.env.MASTER_KEY_B64 = "DoJBQTTy+d9ncfCa7etwiFCqD+QNlp9MlfBslTwxYQ4=";

    await saveCaptureRecord(testCaptureId, {
      id: testCaptureId,
      ownerUid: "test-user-123",
      url: "https://chirp.local/sandbox/post/internship-scam-alert",
      finalUrl: "https://chirp.local/sandbox/post/internship-scam-alert",
      goal: "Capture the full post and comments.",
      mode: "standard",
      status: "AGENT_DONE",
      tinyfish: {
        runId: "run_fixture_tinyfish_001",
        startedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it("completes full finalize pipeline, fingerprints all artifacts and generates bundle", async () => {
    const success = await runFinalizePipeline(testCaptureId);
    expect(success).toBe(true);

    const record = await getCaptureRecord(testCaptureId);
    expect(record.status).toBe("READY");
    expect(record.manifest).toBeDefined();
    expect(record.manifestSha256).toBeDefined();
    expect(record.manifestSha256.length).toBe(64);
    expect(record.manifest.schema).toBe("saakshi.evidence/v1");

    const artifacts = await listArtifactRecords(testCaptureId);
    expect(artifacts.length).toBeGreaterThanOrEqual(5);

    // Verify all stored artifact hashes are valid 64-char lowercase hex
    for (const art of artifacts) {
      expect(art.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(art.bytes).toBeGreaterThan(0);
      expect(art.cid).toBeDefined();
      expect(art.iv).toBeDefined();
      expect(art.authTag).toBeDefined();
    }

    // Verify bundle generation with JSZip
    const dummyDecrypted = artifacts.map((art) => ({
      filename: `${art.id}.dat`,
      plaintextBuffer: Buffer.from("dummy plaintext"),
      sha256: art.sha256,
    }));

    const zipBuffer = await buildEvidenceBundleZip({
      manifest: record.manifest,
      artifacts: dummyDecrypted,
      proofJson: {
        chainId: 80002,
        network: "polygon-amoy",
        contract: "0x123",
        txHash: "0x456",
        blockNumber: 100,
        anchoredAt: new Date().toISOString(),
        root: "0x789",
        manifestSha256: record.manifestSha256,
        proof: [],
        treeFormat: "openzeppelin-standard-v1",
        leafEncoding: ["bytes32"],
        batchCid: "bafytest",
      },
      aiAnalysisJson: record.aiAnalysis,
    });

    expect(zipBuffer).toBeDefined();
    expect(zipBuffer.length).toBeGreaterThan(500);
  });
});
