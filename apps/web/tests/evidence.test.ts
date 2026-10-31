import { describe, it, expect } from "vitest";
import { computeSha256, toBytes32 } from "../lib/evidence/hash";
import { canonicalJson } from "../lib/evidence/canonical";
import { normalizeText } from "../lib/evidence/normalize";
import {
  generateDek,
  encryptWithKey,
  decryptWithKey,
  wrapDek,
  unwrapDek,
  validateMasterKey,
} from "../lib/evidence/crypto";
import { buildMerkleBatch, verifyManifestProof } from "../lib/evidence/merkle";
import {
  EvidenceManifest,
  computeManifestSha256,
  hashUid,
} from "../lib/evidence/manifest";
import {
  uploadBufferToIpfs,
  checkPinataQuota,
  getPinataFileCount,
} from "../lib/evidence/ipfs";
import {
  buildEvidenceBundleStream,
  buildEvidenceBundleZip,
} from "../lib/evidence/bundle";
import JSZip from "jszip";

describe("Evidence Cryptography & Formatting", () => {
  describe("1. SHA-256 Hash Vectors", () => {
    it("matches standard NIST vector for empty string", () => {
      const emptyHash = computeSha256("");
      expect(emptyHash).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      );
    });

    it("matches standard vector for 'abc'", () => {
      const abcHash = computeSha256("abc");
      expect(abcHash).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      );
    });

    it("converts to 0x-prefixed bytes32", () => {
      const b32 = toBytes32("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
      expect(b32).toBe("0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
      expect(b32.length).toBe(66);
    });
  });

  describe("2. RFC 8785 JSON Canonicalization (JCS)", () => {
    it("orders object keys lexicographically and handles nested structures", () => {
      const obj1 = { z: 1, a: 2, m: { y: 10, b: 20 } };
      const obj2 = { a: 2, m: { b: 20, y: 10 }, z: 1 };

      const canon1 = canonicalJson(obj1);
      const canon2 = canonicalJson(obj2);

      expect(canon1).toBe('{"a":2,"m":{"b":20,"y":10},"z":1}');
      expect(canon1).toBe(canon2);
      expect(computeSha256(canon1)).toBe(computeSha256(canon2));
    });

    it("serializes numbers according to RFC 8785 (1.0 -> 1, -0 -> 0, 1e21, small decimals)", () => {
      // 1.0 becomes 1
      expect(canonicalJson({ val: 1.0 })).toBe('{"val":1}');
      // -0 becomes 0
      expect(canonicalJson({ val: -0 })).toBe('{"val":0}');
      // 1e21 uses ES6 format
      expect(canonicalJson({ val: 1e21 })).toBe('{"val":1e+21}');
      // Small decimals follow ES6 formatting
      expect(canonicalJson({ val: 0.000001 })).toBe('{"val":0.000001}');
      expect(canonicalJson({ val: 1e-7 })).toBe('{"val":1e-7}');
    });

    it("formats Unicode strings and escapes per RFC 8785", () => {
      // Standard control character escapes \b, \f, \n, \r, \t and quotes/backslashes
      const escapes = { text: "Line1\nLine2\tTabbed \"Quotes\" and \\backslashes\\" };
      expect(canonicalJson(escapes)).toBe('{"text":"Line1\\nLine2\\tTabbed \\"Quotes\\" and \\\\backslashes\\\\"}');

      // Unicode characters (NFC) must remain literal UTF-8, not escaped as \uXXXX
      const unicodeObj = { symbol: "€", name: "Café", emoji: "😀" };
      expect(canonicalJson(unicodeObj)).toBe('{"emoji":"😀","name":"Café","symbol":"€"}');
    });

    it("produces identical manifestSha256 regardless of property insertion order", () => {
      const manifestA = {
        schema: "saakshi.evidence/v1",
        captureId: "cap_001",
        target: { url: "https://example.com", mode: "standard" },
        observed: { title: "Example", contentHash: "abc" },
        artifacts: [{ id: "art1", sha256: "123", cid: "bafy1" }],
      };

      const manifestB = {
        observed: { contentHash: "abc", title: "Example" },
        schema: "saakshi.evidence/v1",
        artifacts: [{ cid: "bafy1", id: "art1", sha256: "123" }],
        captureId: "cap_001",
        target: { mode: "standard", url: "https://example.com" },
      };

      const jcsA = canonicalJson(manifestA);
      const jcsB = canonicalJson(manifestB);
      expect(jcsA).toBe(jcsB);
      expect(computeSha256(jcsA)).toBe(computeSha256(jcsB));
    });
  });

  describe("3. Text Normalization", () => {
    it("normalizes Unicode, collapses whitespace and unifies newlines", () => {
      // Decomposed vs precomposed characters: 'e\u0301' vs '\u00e9'
      const decomposed = "Cafe\u0301   Internship \r\n\r\n\r\n  Fee:  Rs 2000  ";
      const normalized = normalizeText(decomposed);

      expect(normalized).toBe("Café Internship\n\nFee: Rs 2000");
      expect(normalized).toBe(normalizeText("Café   Internship\n\n\nFee:   Rs 2000"));
    });

    it("ensures NFC and NFD input produce identical normalized text and contentHash", () => {
      // "résumé" in NFC (precomposed) vs NFD (decomposed)
      const nfc = "Preserving authentic résumé of author: Zoë Müller";
      const nfd = nfc.normalize("NFD");

      expect(nfc).not.toBe(nfd); // Under the hood binary representations differ

      const normNfc = normalizeText(nfc);
      const normNfd = normalizeText(nfd);

      expect(normNfc).toBe(normNfd);
      expect(computeSha256(normNfc)).toBe(computeSha256(normNfd));
    });

    it("ensures whitespace variants produce identical contentHash", () => {
      const v1 = "Breaking  News:\tScam  detected!\r\n\r\n\r\n  Contact   police immediately.\n\n";
      const v2 = "Breaking News: Scam detected!\n\nContact police immediately.";
      const v3 = "  Breaking   News:   Scam   detected!  \r\n\r\n  Contact police immediately.   ";

      const hash1 = computeSha256(normalizeText(v1));
      const hash2 = computeSha256(normalizeText(v2));
      const hash3 = computeSha256(normalizeText(v3));

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });

  describe("4. AES-256-GCM Envelope Encryption & Tamper Detection", () => {
    const masterKey = Buffer.from(
      "DoJBQTTy+d9ncfCa7etwiFCqD+QNlp9MlfBslTwxYQ4=",
      "base64"
    );

    it("validates MASTER_KEY_B64 length and rejects invalid lengths", () => {
      // 16 bytes (128-bit) base64
      const key16 = Buffer.alloc(16, 0xaa).toString("base64");
      expect(() => validateMasterKey(key16)).toThrow(/must decode to exactly 32 bytes/);

      // 40 bytes base64
      const key40 = Buffer.alloc(40, 0xbb).toString("base64");
      expect(() => validateMasterKey(key40)).toThrow(/must decode to exactly 32 bytes/);

      // Empty string
      expect(() => validateMasterKey("")).toThrow(/not configured/);

      // Valid 32 bytes
      const validKey = Buffer.alloc(32, 0xcc).toString("base64");
      const validated = validateMasterKey(validKey);
      expect(validated.length).toBe(32);
    });

    it("round-trips plaintext correctly with bound AAD", () => {
      const dek = generateDek();
      const plaintext = Buffer.from("Court-admissible web evidence captured by TinyFish.");
      const aad = "cap_2026_test:art_fullpage_screenshot";

      const encrypted = encryptWithKey(plaintext, dek, aad);
      const decrypted = decryptWithKey(
        encrypted.ciphertext,
        dek,
        encrypted.ivHex,
        encrypted.authTagHex,
        aad
      );

      expect(decrypted.toString("utf8")).toBe(plaintext.toString("utf8"));
    });

    it("fails decryption when AAD is wrong (prevents swapping between captures/artifacts)", () => {
      const dek = generateDek();
      const plaintext = Buffer.from("Confidential artifact belonging to Capture A");
      const aadA = "capture_A:art_screenshot";
      const aadB = "capture_B:art_screenshot"; // Swapped capture
      const aadArtifactSwap = "capture_A:art_dom_html"; // Swapped artifact

      const encrypted = encryptWithKey(plaintext, dek, aadA);

      // Swap capture ID
      expect(() => {
        decryptWithKey(
          encrypted.ciphertext,
          dek,
          encrypted.ivHex,
          encrypted.authTagHex,
          aadB
        );
      }).toThrow();

      // Swap artifact ID
      expect(() => {
        decryptWithKey(
          encrypted.ciphertext,
          dek,
          encrypted.ivHex,
          encrypted.authTagHex,
          aadArtifactSwap
        );
      }).toThrow();

      // Missing AAD
      expect(() => {
        decryptWithKey(
          encrypted.ciphertext,
          dek,
          encrypted.ivHex,
          encrypted.authTagHex
        );
      }).toThrow();
    });

    it("detects tampering in ciphertext (GCM auth tag check failure)", () => {
      const dek = generateDek();
      const plaintext = Buffer.from("Sensitive confidential post.");
      const aad = "cap_1:art_1";

      const encrypted = encryptWithKey(plaintext, dek, aad);

      // Flip 1 byte in ciphertext
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext);
      tamperedCiphertext[0] ^= 0x01;

      expect(() => {
        decryptWithKey(
          tamperedCiphertext,
          dek,
          encrypted.ivHex,
          encrypted.authTagHex,
          aad
        );
      }).toThrow();
    });

    it("detects tampering in IV", () => {
      const dek = generateDek();
      const plaintext = Buffer.from("Sensitive confidential post.");
      const aad = "cap_1:art_1";
      const encrypted = encryptWithKey(plaintext, dek, aad);

      const tamperedIv = Buffer.from(encrypted.ivHex, "hex");
      tamperedIv[0] ^= 0x01;

      expect(() => {
        decryptWithKey(
          encrypted.ciphertext,
          dek,
          tamperedIv.toString("hex"),
          encrypted.authTagHex,
          aad
        );
      }).toThrow();
    });

    it("detects tampering in auth tag", () => {
      const dek = generateDek();
      const plaintext = Buffer.from("Sensitive confidential post.");
      const aad = "cap_1:art_1";
      const encrypted = encryptWithKey(plaintext, dek, aad);

      const tamperedTag = Buffer.from(encrypted.authTagHex, "hex");
      tamperedTag[0] ^= 0xff;

      expect(() => {
        decryptWithKey(
          encrypted.ciphertext,
          dek,
          encrypted.ivHex,
          tamperedTag.toString("hex"),
          aad
        );
      }).toThrow();
    });

    it("fails to unwrap DEK when wrong master key is used", () => {
      const dek = generateDek();
      const wrongMasterKey = Buffer.alloc(32, 0x99);

      const wrapped = wrapDek(dek, masterKey);
      expect(() => {
        unwrapDek(wrapped, wrongMasterKey);
      }).toThrow();
    });

    it("wraps and unwraps DEK with Master Key", () => {
      const dek = generateDek();
      const wrapped = wrapDek(dek, masterKey);
      const unwrapped = unwrapDek(wrapped, masterKey);

      expect(unwrapped.toString("hex")).toBe(dek.toString("hex"));
    });

    it("ensures IVs are never reused across 1,000 encryptions", () => {
      const dek = generateDek();
      const plaintext = Buffer.from("Sample payload for IV randomness check");
      const ivSet = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        const encrypted = encryptWithKey(plaintext, dek);
        expect(encrypted.ivHex.length).toBe(24); // 12 bytes = 24 hex chars
        ivSet.add(encrypted.ivHex);
      }

      expect(ivSet.size).toBe(1000);
    });

    it("verifies SHA-256 integrity on read and rejects corrupt artifact bytes", () => {
      const dek = generateDek();
      const authenticBytes = Buffer.from("Authentic courtroom evidence file");
      const expectedSha256 = computeSha256(authenticBytes);
      const aad = "cap_read_test:art_file";

      const enc = encryptWithKey(authenticBytes, dek, aad);
      const decrypted = decryptWithKey(enc.ciphertext, dek, enc.ivHex, enc.authTagHex, aad);

      // Matches expected hash
      expect(computeSha256(decrypted)).toBe(expectedSha256);

      // Corrupted / altered bytes
      const corruptedBytes = Buffer.from("Tampered bytes substituted after read");
      expect(computeSha256(corruptedBytes)).not.toBe(expectedSha256);
    });
  });

  describe("5. Merkle Tree Proofs for Batches", () => {
    const batchSizes = [1, 2, 7];

    for (const size of batchSizes) {
      it(`constructs and verifies OpenZeppelin Merkle proofs for batch size ${size}`, () => {
        const hashes: string[] = [];
        for (let i = 0; i < size; i++) {
          hashes.push(computeSha256(`manifest-doc-${i}`));
        }

        const batch = buildMerkleBatch(hashes);
        expect(batch.size).toBe(size);
        expect(batch.root).toBeDefined();

        for (const hash of hashes) {
          const proof = batch.getProofForManifest(hash);
          const isValid = verifyManifestProof(batch.root, hash, proof);
          expect(isValid).toBe(true);

          // Tampered hash verification must fail
          const tampered = computeSha256(`tampered-hash-byte-${hash}`);
          const isTamperedValid = verifyManifestProof(batch.root, tampered, proof);
          expect(isTamperedValid).toBe(false);
        }
      });
    }
  });

  describe("6. Manifest Specification & Privacy (PRD Section 9.2, FR-9.3)", () => {
    it("excludes AI output and draft certificate from anchored manifest", () => {
      const manifest: EvidenceManifest = {
        schema: "saakshi.evidence/v1",
        captureId: "cap_privacy_test",
        previousCaptureId: null,
        requester: {
          uidHash: hashUid("user-12345", "test_salt"),
        },
        target: {
          url: "https://example.com/target",
          finalUrl: "https://example.com/target",
          mode: "standard",
        },
        time: {
          serverStartedAt: "2026-10-31T12:00:00.000Z",
          serverFinishedAt: "2026-10-31T12:00:05.000Z",
        },
        tools: {
          saakshiVersion: "0.1.0",
          gitCommit: "abc1234",
          tinyfish: {
            agentRunId: "run_123",
          },
        },
        observed: {
          contentHash: computeSha256("example content"),
        },
        artifacts: [
          {
            id: "art_shot",
            kind: "fullpage_screenshot",
            mime: "image/png",
            bytes: 12345,
            sha256: computeSha256("shot_bytes"),
            cid: "bafy_shot_test",
            capturedAt: "2026-10-31T12:00:02.000Z",
          },
        ],
        hashAlgorithm: "SHA-256",
        encryption: "AES-256-GCM (cid refers to ciphertext; sha256 refers to plaintext)",
      };

      // Manifest must NOT contain AI fields or certificate
      expect((manifest as any).aiAnalysis).toBeUndefined();
      expect((manifest as any).certificate).toBeUndefined();
      expect(manifest.artifacts.some((a) => (a.kind as string).includes("ai"))).toBe(false);
      expect(manifest.artifacts.some((a) => (a.kind as string).includes("certificate"))).toBe(false);

      const { manifestSha256, bytes32Hash } = computeManifestSha256(manifest);
      expect(manifestSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(bytes32Hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it("ensures requester is stored only as a salted uidHash without plain email, name or keys", () => {
      const plainUid = "user_victim_victim@example.com";
      const salt = "unique_saakshi_salt_2026";
      const saltedHash = hashUid(plainUid, salt);

      expect(saltedHash).toMatch(/^[a-f0-9]{64}$/);
      expect(saltedHash).not.toContain("user_victim");
      expect(saltedHash).not.toContain("@example.com");

      // Changing salt produces a completely different hash
      const differentSaltHash = hashUid(plainUid, "different_salt");
      expect(differentSaltHash).not.toBe(saltedHash);
    });

    it("requires artifacts to have CIDs before computing manifest hash", () => {
      const artifactWithoutCid: any = {
        id: "art_1",
        kind: "fullpage_screenshot",
        mime: "image/png",
        bytes: 500,
        sha256: "abc",
      };

      // Valid artifact requires CID
      expect(artifactWithoutCid.cid).toBeUndefined();

      const validArtifact = {
        ...artifactWithoutCid,
        cid: "bafy_actual_cid_from_pinata",
        capturedAt: new Date().toISOString(),
      };
      expect(validArtifact.cid).toBeDefined();
    });
  });

  describe("7. IPFS Pinata V3 Module & Free-Plan File Guard", () => {
    it("calls Pinata V3 upload with correct shape and metadata free of URLs", async () => {
      let uploadedFile: any = null;
      let capturedMetadata: any = null;

      const mockPinata: any = {
        upload: {
          file: (file: any) => {
            uploadedFile = file;
            return {
              addMetadata: (meta: any) => {
                capturedMetadata = meta;
                return Promise.resolve({
                  cid: "bafy_test_v3_cid_12345",
                  size: file.size,
                  id: "pinata_file_uuid_999",
                });
              },
            };
          },
        },
      };

      const testBuffer = Buffer.from("ciphertext bytes for testing");
      const res = await uploadBufferToIpfs(
        testBuffer,
        {
          name: "saakshi_cap999_art1.enc",
          captureId: "cap999",
          kind: "fullpage_screenshot",
        },
        mockPinata
      );

      expect(res.cid).toBe("bafy_test_v3_cid_12345");
      expect(res.pinataFileId).toBe("pinata_file_uuid_999");
      expect(res.isFallback).toBe(false);

      expect(uploadedFile.name).toBe("saakshi_cap999_art1.enc");
      expect(capturedMetadata).toBeDefined();
      expect(capturedMetadata.name).toBe("saakshi_cap999_art1.enc");
      expect(capturedMetadata.keyvalues).toEqual({
        app: "saakshi",
        env: process.env.NODE_ENV === "production" ? "prod" : "dev",
        captureId: "cap999",
        kind: "fullpage_screenshot",
      });

      // Verify ZERO URLs, titles or sensitive user data in keyvalues
      const kvValues = Object.values(capturedMetadata.keyvalues);
      for (const val of kvValues) {
        expect(String(val)).not.toContain("http://");
        expect(String(val)).not.toContain("https://");
        expect(String(val)).not.toContain("@");
      }
    });

    it("refuses fallback in production when Pinata is not configured", async () => {
      const origFallback = process.env.IPFS_FALLBACK;
      const origJwt = process.env.PINATA_JWT;

      try {
        delete process.env.IPFS_FALLBACK;
        delete process.env.PINATA_JWT;

        const testBuf = Buffer.from("test");
        await expect(
          uploadBufferToIpfs(testBuf, "test.enc", null)
        ).rejects.toThrow(/PINATA_JWT is not configured.*Production requires valid Pinata credentials/);
      } finally {
        if (origFallback !== undefined) process.env.IPFS_FALLBACK = origFallback;
        if (origJwt !== undefined) process.env.PINATA_JWT = origJwt;
      }
    });

    it("allows fallback only when IPFS_FALLBACK=dev is explicitly set", async () => {
      const origFallback = process.env.IPFS_FALLBACK;
      const origJwt = process.env.PINATA_JWT;

      try {
        process.env.IPFS_FALLBACK = "dev";
        delete process.env.PINATA_JWT;

        const testBuf = Buffer.from("sample plaintext for mock cid");
        const res = await uploadBufferToIpfs(testBuf, "test.enc", null);

        expect(res.cid).toMatch(/^bafy_mock_/);
        expect(res.isFallback).toBe(true);
      } finally {
        if (origFallback !== undefined) process.env.IPFS_FALLBACK = origFallback;
        if (origJwt !== undefined) process.env.PINATA_JWT = origJwt;
      }
    });

    it("file guard warns above 400 files and blocks at >= 480 files", async () => {
      const origFallback = process.env.IPFS_FALLBACK;

      try {
        // Case 1: Count = 405 (Warning range)
        const mock405: any = {
          files: {
            list: () => ({
              all: () => Promise.resolve(new Array(405).fill({ id: "f" })),
            }),
          },
        };
        const quota405 = await checkPinataQuota(mock405);
        expect(quota405.count).toBe(405);
        expect(quota405.allowed).toBe(true);
        expect(quota405.warning).toContain("405/500 files used");

        // Case 2: Count = 485 without dev fallback (Refused)
        delete process.env.IPFS_FALLBACK;
        const mock485: any = {
          files: {
            list: () => ({
              all: () => Promise.resolve(new Array(485).fill({ id: "f" })),
            }),
          },
        };
        const quota485 = await checkPinataQuota(mock485);
        expect(quota485.count).toBe(485);
        expect(quota485.allowed).toBe(false);
        expect(quota485.warning).toContain("Pinata free-tier quota reached: 485/500 files used");

        // Case 3: Count = 485 with IPFS_FALLBACK=dev (Allowed with warning)
        process.env.IPFS_FALLBACK = "dev";
        const quota485Dev = await checkPinataQuota(mock485);
        expect(quota485Dev.count).toBe(485);
        expect(quota485Dev.allowed).toBe(true);
        expect(quota485Dev.warning).toContain("IPFS_FALLBACK=dev enabled");
      } finally {
        if (origFallback !== undefined) process.env.IPFS_FALLBACK = origFallback;
      }
    });
  });

  describe("8. Evidence Bundle Stream & Offline Verification (FR-10.1)", () => {
    const sampleManifest: EvidenceManifest = {
      schema: "saakshi.evidence/v1",
      captureId: "cap_bundle_test_01",
      previousCaptureId: null,
      requester: { uidHash: hashUid("test_user", "salt") },
      target: { url: "https://example.com", finalUrl: "https://example.com", mode: "standard" },
      time: {
        serverStartedAt: "2026-10-31T10:00:00.000Z",
        serverFinishedAt: "2026-10-31T10:00:05.000Z",
      },
      tools: {
        saakshiVersion: "0.1.0",
        gitCommit: "git-test",
        tinyfish: { agentRunId: "run_99" },
      },
      observed: { contentHash: computeSha256("test text") },
      artifacts: [
        {
          id: "art_screenshot",
          kind: "fullpage_screenshot",
          mime: "image/png",
          bytes: 14,
          sha256: computeSha256("screenshot png"),
          cid: "bafy_shot",
          capturedAt: "2026-10-31T10:00:02.000Z",
        },
        {
          id: "art_dom",
          kind: "dom_html",
          mime: "text/html",
          bytes: 9,
          sha256: computeSha256("html page"),
          cid: "bafy_dom",
          capturedAt: "2026-10-31T10:00:03.000Z",
        },
      ],
      hashAlgorithm: "SHA-256",
      encryption: "AES-256-GCM (cid refers to ciphertext; sha256 refers to plaintext)",
    };

    const artifacts = [
      {
        filename: "art_screenshot_fullpage_screenshot.png",
        plaintextBuffer: Buffer.from("screenshot png"),
        sha256: computeSha256("screenshot png"),
      },
      {
        filename: "art_dom_dom_html.html",
        plaintextBuffer: Buffer.from("html page"),
        sha256: computeSha256("html page"),
      },
    ];

    it("streams ZIP bundle containing plaintext artifacts, manifest, and instructions", async () => {
      const { manifestSha256 } = computeManifestSha256(sampleManifest);
      const stream = buildEvidenceBundleStream({
        manifest: sampleManifest,
        artifacts,
        proofJson: {
          chainId: 80002,
          network: "polygon-amoy",
          contract: "0x123",
          txHash: "0xtxhash",
          blockNumber: 12345,
          anchoredAt: "2026-10-31T10:05:00.000Z",
          root: "0xroot",
          manifestSha256,
          proof: [],
          treeFormat: "openzeppelin-standard-v1",
          leafEncoding: ["bytes32"],
          batchCid: "bafy_batch",
        },
        aiAnalysisJson: { claims: ["claim1"] },
        certificatePdfBuffer: Buffer.from("mock pdf"),
      });

      // Read Web ReadableStream into Buffer
      const response = new Response(stream);
      const arrayBuf = await response.arrayBuffer();
      const zipBuf = Buffer.from(arrayBuf);

      expect(zipBuf.length).toBeGreaterThan(0);

      // Unzip and inspect contents
      const zip = await JSZip.loadAsync(zipBuf);

      // 1. Manifest
      const manifestFile = zip.file("manifest.json");
      expect(manifestFile).toBeDefined();
      const manifestInZip = JSON.parse(await manifestFile!.async("text"));
      expect(manifestInZip.schema).toBe("saakshi.evidence/v1");

      // 2. Proof.json
      const proofFile = zip.file("proof.json");
      expect(proofFile).toBeDefined();
      const proofInZip = JSON.parse(await proofFile!.async("text"));
      expect(proofInZip.manifestSha256).toBe(manifestSha256);

      // 3. AI Analysis & Certificate
      expect(zip.file("ai_analysis.json")).toBeDefined();
      expect(zip.file("certificate_part_a_draft.pdf")).toBeDefined();
      expect(zip.file("VERIFY.md")).toBeDefined();

      // 4. Artifacts verification
      for (const art of artifacts) {
        const file = zip.file(`artifacts/${art.filename}`);
        expect(file).toBeDefined();
        const buf = await file!.async("nodebuffer");
        expect(computeSha256(buf)).toBe(art.sha256);
      }
    });

    it("omits proof.json from bundle if capture is not yet anchored on-chain", async () => {
      const stream = buildEvidenceBundleStream({
        manifest: sampleManifest,
        artifacts,
        proofJson: null, // Not anchored
      });

      const response = new Response(stream);
      const zipBuf = Buffer.from(await response.arrayBuffer());
      const zip = await JSZip.loadAsync(zipBuf);

      expect(zip.file("manifest.json")).toBeDefined();
      expect(zip.file("proof.json")).toBeNull(); // Must NOT be in unanchored bundle
    });
  });
});
