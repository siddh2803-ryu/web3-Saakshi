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
});
