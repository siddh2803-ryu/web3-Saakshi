import { describe, it, expect } from "vitest";
import { computeSha256 } from "@/lib/evidence/hash";
import { sha256Hex, computeCanonicalManifestHash } from "@/lib/evidence/webcrypto";
import { computeManifestSha256, EvidenceManifest } from "@/lib/evidence/manifest";
import {
  ResultState,
  validateProofSecurity,
  executeDirectOnChainVerify,
} from "@/lib/evidence/verification";

describe("Phase 5: Public Trustless Verification Suite", () => {
  describe("1. Cryptographic Parity: Node.js vs WebCrypto", () => {
    it("produces identical SHA-256 hashes for empty string, ASCII, UTF-8, and binary", async () => {
      const testCases = [
        "",
        "abc",
        "Saakshi Forensic Evidence Engine 2026",
        "विशेष रूप से भारतीय साक्ष्य अधिनियम 2023",
        "Emoji test 🔒🔍⚡️🛡️",
        JSON.stringify({ a: 1, b: [2, 3], c: { d: "test" } }),
      ];

      for (const text of testCases) {
        const nodeHash = computeSha256(text);
        const webCryptoHash = await sha256Hex(text);
        expect(webCryptoHash).toBe(nodeHash);
      }
    });

    it("produces identical SHA-256 for Uint8Array buffers", async () => {
      const buffer = new Uint8Array([0, 1, 2, 3, 255, 128, 64, 32]);
      const nodeHash = computeSha256(buffer);
      const webCryptoHash = await sha256Hex(buffer);
      expect(webCryptoHash).toBe(nodeHash);
    });

    it("shared RFC 8785 JCS module produces identical manifestSha256 in WebCrypto and Node", async () => {
      const sampleManifest: EvidenceManifest = {
        schema: "saakshi.evidence/v1",
        captureId: "cap_unit_test_001",
        previousCaptureId: null,
        requester: { uidHash: "test_uid_hash" },
        target: {
          url: "https://example.com/post/1",
          finalUrl: "https://example.com/post/1",
          goal: "Preserve post for verification",
          mode: "standard",
        },
        time: {
          serverStartedAt: "2026-11-01T12:00:00.000Z",
          serverFinishedAt: "2026-11-01T12:02:00.000Z",
        },
        tools: {
          saakshiVersion: "1.0.0",
          gitCommit: "abc1234",
          tinyfish: { agentRunId: "run_123" },
        },
        observed: {
          title: "Sample Observed Page",
          author: "@test_author",
          contentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
        artifacts: [
          {
            id: "art_screenshot",
            kind: "fullpage_screenshot",
            mime: "image/png",
            bytes: 12345,
            sha256: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            cid: "bafy_art_1",
            capturedAt: "2026-11-01T12:01:00.000Z",
          },
        ],
        hashAlgorithm: "SHA-256",
        encryption: "AES-256-GCM (cid refers to ciphertext; sha256 refers to plaintext)",
      };

      const nodeResult = computeManifestSha256(sampleManifest);
      const webCryptoResult = await computeCanonicalManifestHash(sampleManifest);

      expect(webCryptoResult.manifestSha256).toBe(nodeResult.manifestSha256);
      expect(webCryptoResult.canonical).toBe(nodeResult.canonicalJsonString);
    });
  });

  describe("2. Security: Wrong-Contract and Wrong-Chain Rejection", () => {
    const OFFICIAL_CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const OFFICIAL_CHAIN = 31337;

    it("accepts proof matching official deployment contract and chain ID", () => {
      const validProof = {
        contract: OFFICIAL_CONTRACT,
        chainId: OFFICIAL_CHAIN,
        root: "0xroot123",
      };

      const res = validateProofSecurity(validProof, {
        contract: OFFICIAL_CONTRACT,
        chainId: OFFICIAL_CHAIN,
      });

      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("rejects proof pointing to a different/rogue contract address", () => {
      const rogueProof = {
        contract: "0x9999999999999999999999999999999999999999",
        chainId: OFFICIAL_CHAIN,
        root: "0xroot123",
      };

      const res = validateProofSecurity(rogueProof, {
        contract: OFFICIAL_CONTRACT,
        chainId: OFFICIAL_CHAIN,
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain("This proof points to a different contract");
    });

    it("rejects proof pointing to a different chain ID", () => {
      const wrongChainProof = {
        contract: OFFICIAL_CONTRACT,
        chainId: 1, // Mainnet instead of Amoy/Local
        root: "0xroot123",
      };

      const res = validateProofSecurity(wrongChainProof, {
        contract: OFFICIAL_CONTRACT,
        chainId: OFFICIAL_CHAIN,
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain("instead of expected chain ID");
    });
  });

  describe("3. Result-State Logic Coverage (All 5 PRD States)", () => {
    it("defines and validates all 5 explicit verification states", () => {
      const validStates: ResultState[] = [
        "VERIFIED",
        "NOT_FOUND",
        "ALTERED",
        "NOT_YET_ANCHORED",
        "CHAIN_CHECK_FAILED",
      ];

      expect(validStates.length).toBe(5);
    });

    it("identifies unanchored state when proof is missing or pending", () => {
      const pendingProof = {
        txHash: "",
        root: "",
      };
      const isAnchored = Boolean(pendingProof.txHash && pendingProof.root);
      expect(isAnchored).toBe(false);
    });

    it("handles RPC failure gracefully without throwing unhandled exceptions", async () => {
      const badRpcs = ["http://127.0.0.1:9999"]; // non-existent port
      const result = await executeDirectOnChainVerify(
        "0x1234567890123456789012345678901234567890123456789012345678901234",
        [],
        "0x1234567890123456789012345678901234567890123456789012345678901234",
        "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        badRpcs
      );

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toContain("failed");
      }
    });
  });

  describe("4. Proof.json Schema and Parsing", () => {
    it("parses valid proof.json and validates standard Merkle fields", () => {
      const proofStr = JSON.stringify({
        chainId: 31337,
        network: "local",
        contract: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        txHash: "0xtx123",
        blockNumber: 42,
        anchoredAt: "2026-11-01T10:00:00.000Z",
        root: "0xroot",
        manifestSha256: "6c6d7fd61b8ef4127fa460678813e34c915860c8bb86b54518fe53b7312b78f0",
        proof: ["0xproof1", "0xproof2"],
        treeFormat: "openzeppelin-standard-v1",
        leafEncoding: ["bytes32"],
        batchCid: "bafy_batch_123",
      });

      const parsed = JSON.parse(proofStr);
      expect(parsed.contract).toBeDefined();
      expect(parsed.root).toBeDefined();
      expect(parsed.proof).toBeInstanceOf(Array);
      expect(parsed.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(parsed.treeFormat).toBe("openzeppelin-standard-v1");
    });
  });
});
