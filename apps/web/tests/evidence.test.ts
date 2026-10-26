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
    it("orders object keys lexicographically", () => {
      const obj1 = { z: 1, a: 2, m: { y: 10, b: 20 } };
      const obj2 = { a: 2, m: { b: 20, y: 10 }, z: 1 };

      const canon1 = canonicalJson(obj1);
      const canon2 = canonicalJson(obj2);

      expect(canon1).toBe('{"a":2,"m":{"b":20,"y":10},"z":1}');
      expect(canon1).toBe(canon2);
      expect(computeSha256(canon1)).toBe(computeSha256(canon2));
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
  });

  describe("4. AES-256-GCM Envelope Encryption & Tamper Detection", () => {
    const masterKey = Buffer.from(
      "DoJBQTTy+d9ncfCa7etwiFCqD+QNlp9MlfBslTwxYQ4=",
      "base64"
    );

    it("round-trips plaintext correctly", () => {
      const dek = generateDek();
      const plaintext = Buffer.from("Court-admissible web evidence captured by TinyFish.");

      const encrypted = encryptWithKey(plaintext, dek);
      const decrypted = decryptWithKey(
        encrypted.ciphertext,
        dek,
        encrypted.ivHex,
        encrypted.authTagHex
      );

      expect(decrypted.toString("utf8")).toBe(plaintext.toString("utf8"));
    });

    it("detects tampering in ciphertext (GCM auth tag check failure)", () => {
      const dek = generateDek();
      const plaintext = Buffer.from("Sensitive confidential post.");

      const encrypted = encryptWithKey(plaintext, dek);

      // Flip 1 byte in ciphertext
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext);
      tamperedCiphertext[0] ^= 0x01;

      expect(() => {
        decryptWithKey(
          tamperedCiphertext,
          dek,
          encrypted.ivHex,
          encrypted.authTagHex
        );
      }).toThrow();
    });

    it("detects tampering in auth tag", () => {
      const dek = generateDek();
      const plaintext = Buffer.from("Sensitive confidential post.");
      const encrypted = encryptWithKey(plaintext, dek);

      const tamperedTag = Buffer.from(encrypted.authTagHex, "hex");
      tamperedTag[0] ^= 0xff;

      expect(() => {
        decryptWithKey(
          encrypted.ciphertext,
          dek,
          encrypted.ivHex,
          tamperedTag.toString("hex")
        );
      }).toThrow();
    });

    it("wraps and unwraps DEK with Master Key", () => {
      const dek = generateDek();
      const wrapped = wrapDek(dek, masterKey);
      const unwrapped = unwrapDek(wrapped, masterKey);

      expect(unwrapped.toString("hex")).toBe(dek.toString("hex"));
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
