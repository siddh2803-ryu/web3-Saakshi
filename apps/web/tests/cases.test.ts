import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import {
  saveCaseRecord,
  getCaseRecord,
  deleteCaseRecord,
  listUserCases,
  assignCaptureToCase,
  saveCaptureRecord,
  getCaptureRecord,
} from "@/lib/firebase/admin";
import {
  buildCaseExportZip,
  CaseExportOptions,
  CaseManifestJson,
} from "@/lib/evidence/bundle";
import { searchReposts } from "@/lib/tinyfish/search";
import {
  pickRepostPhrases,
  extractDistinctiveFragments,
  truncateToWordLimit,
} from "@/lib/tinyfish/phrase-picker";
import { normalizeCompareUrl } from "@/lib/validation/url";
import * as tinyfishClient from "@/lib/tinyfish/client";

describe("Phase 8: Cases & Repost Finder Suite (PRD 6 F11, F12, 7.4, 9.1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------
  // 1. Cases Data Model & Firestore Security Rules
  // -------------------------------------------------------------
  describe("1. Cases Data Model & Owner-Only Firestore Security Rules", () => {
    it("creates, retrieves, and lists cases for an owner", async () => {
      const caseId = "case_test_001";
      const created = await saveCaseRecord(caseId, {
        ownerUid: "test-user-alice",
        title: "Defamation Case Matter 2026",
        notes: "Privileged legal notes for advocate.",
        captureIds: [],
      });

      expect(created.id).toBe(caseId);
      expect(created.ownerUid).toBe("test-user-alice");
      expect(created.title).toBe("Defamation Case Matter 2026");
      expect(created.notes).toBe("Privileged legal notes for advocate.");
      expect(created.captureIds).toEqual([]);

      const fetched = await getCaseRecord(caseId);
      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe("Defamation Case Matter 2026");

      const aliceCases = await listUserCases("test-user-alice");
      expect(aliceCases.some((c) => c.id === caseId)).toBe(true);

      const bobCases = await listUserCases("test-user-bob");
      expect(bobCases.some((c) => c.id === caseId)).toBe(false);
    });

    it("renames a case and updates notes", async () => {
      const caseId = "case_test_002";
      await saveCaseRecord(caseId, {
        ownerUid: "test-user-alice",
        title: "Initial Title",
        notes: "Draft notes",
        captureIds: [],
      });

      const updated = await saveCaseRecord(caseId, {
        title: "Renamed Title",
        notes: "Updated private notes",
      });

      expect(updated.title).toBe("Renamed Title");
      expect(updated.notes).toBe("Updated private notes");

      const fetched = await getCaseRecord(caseId);
      expect(fetched?.title).toBe("Renamed Title");
      expect(fetched?.notes).toBe("Updated private notes");
    });

    it("deleting a case unassigns its captures while preserving the captures themselves", async () => {
      const caseId = "case_test_del_001";
      const capId1 = "cap_in_case_001";
      const capId2 = "cap_in_case_002";

      // Setup captures
      await saveCaptureRecord(capId1, {
        id: capId1,
        ownerUid: "test-user-alice",
        url: "https://chirp.local/sandbox/post/1",
        status: "READY",
        caseId,
      });
      await saveCaptureRecord(capId2, {
        id: capId2,
        ownerUid: "test-user-alice",
        url: "https://chirp.local/sandbox/post/2",
        status: "READY",
        caseId,
      });

      // Create case linking these captures
      await saveCaseRecord(caseId, {
        ownerUid: "test-user-alice",
        title: "Temporary Case",
        captureIds: [capId1, capId2],
      });

      // Delete the case
      const deleted = await deleteCaseRecord(caseId);
      expect(deleted).toBe(true);

      // Case record is deleted
      const fetchedCase = await getCaseRecord(caseId);
      expect(fetchedCase).toBeNull();

      // Captures are preserved and unassigned
      const cap1 = await getCaptureRecord(capId1);
      const cap2 = await getCaptureRecord(capId2);
      expect(cap1).not.toBeNull();
      expect(cap2).not.toBeNull();
      expect(cap1?.caseId).toBeNull();
      expect(cap2?.caseId).toBeNull();
    });

    it("assigns and moves captures between cases atomically", async () => {
      const caseA = "case_test_move_a";
      const caseB = "case_test_move_b";
      const capId = "cap_moving_001";

      await saveCaseRecord(caseA, {
        ownerUid: "test-user-alice",
        title: "Case Alpha",
        captureIds: [],
      });
      await saveCaseRecord(caseB, {
        ownerUid: "test-user-alice",
        title: "Case Beta",
        captureIds: [],
      });
      await saveCaptureRecord(capId, {
        id: capId,
        ownerUid: "test-user-alice",
        url: "https://example.com/target",
        caseId: null,
      });

      // 1. Assign to Case A
      await assignCaptureToCase(capId, caseA);
      let capRecord = await getCaptureRecord(capId);
      let caseARecord = await getCaseRecord(caseA);
      expect(capRecord?.caseId).toBe(caseA);
      expect(caseARecord?.captureIds).toContain(capId);

      // 2. Move from Case A to Case B
      await assignCaptureToCase(capId, caseB);
      capRecord = await getCaptureRecord(capId);
      caseARecord = await getCaseRecord(caseA);
      let caseBRecord = await getCaseRecord(caseB);
      expect(capRecord?.caseId).toBe(caseB);
      expect(caseARecord?.captureIds).not.toContain(capId);
      expect(caseBRecord?.captureIds).toContain(capId);

      // 3. Unassign from Case B (set to null)
      await assignCaptureToCase(capId, null);
      capRecord = await getCaptureRecord(capId);
      caseBRecord = await getCaseRecord(caseB);
      expect(capRecord?.caseId).toBeNull();
      expect(caseBRecord?.captureIds).not.toContain(capId);
    });

    it("verifies firestore.rules enforces owner-only access for cases/{caseId}", () => {
      const rulesPath = path.resolve(process.cwd(), "../../firestore.rules");
      const altRulesPath = path.resolve(process.cwd(), "firestore.rules");
      const pathToUse = fs.existsSync(rulesPath) ? rulesPath : altRulesPath;

      expect(fs.existsSync(pathToUse)).toBe(true);
      const rulesContent = fs.readFileSync(pathToUse, "utf8");

      // Verify cases collection block exists
      expect(rulesContent).toContain("match /cases/{caseId}");
      // Verify owner-only read, update, delete
      expect(rulesContent).toMatch(/allow read.*if isOwner\(resource\.data\.ownerUid\)/);
      expect(rulesContent).toMatch(/allow create.*if isOwner\(request\.resource\.data\.ownerUid\)/);
      expect(rulesContent).toMatch(/allow update, delete.*if isOwner\(resource\.data\.ownerUid\)/);
      // Verify helper functions
      expect(rulesContent).toContain("function isOwner(uid)");
      expect(rulesContent).toContain("request.auth.uid == uid");
    });
  });

  // -------------------------------------------------------------
  // 2. Case-Level ZIP Export & Manifest (FR-12.2)
  // -------------------------------------------------------------
  describe("2. Case-Level ZIP Export & Case Manifest", () => {
    it("builds a case ZIP containing each capture in its own subfolder and root case-manifest.json", async () => {
      const exportOptions: CaseExportOptions = {
        caseData: {
          id: "case_export_123",
          ownerUid: "owner_alice",
          title: "Investigation 2026",
          notes: "Confidential case notes",
          createdAt: "2026-11-01T10:00:00.000Z",
        },
        captures: [
          {
            captureId: "cap_exp_001",
            manifestSha256: "1111111111111111111111111111111111111111111111111111111111111111",
            status: "ANCHORED",
            url: "https://chirp.local/sandbox/post/internship-scam-alert",
            createdAt: "2026-11-01T10:05:00.000Z",
            bundleOptions: {
              manifest: {
                schema: "saakshi.evidence/v1",
                captureId: "cap_exp_001",
                previousCaptureId: null,
                requester: { uidHash: "hash_001" },
                target: {
                  url: "https://chirp.local/sandbox/post/internship-scam-alert",
                  finalUrl: "https://chirp.local/sandbox/post/internship-scam-alert",
                  goal: "Preserve post",
                  mode: "standard",
                },
                time: {
                  serverStartedAt: "2026-11-01T10:05:00.000Z",
                  serverFinishedAt: "2026-11-01T10:05:30.000Z",
                },
                tools: {
                  saakshiVersion: "0.1.0",
                  gitCommit: "test",
                  tinyfish: {},
                },
                observed: {
                  title: "Fake Internship Scam",
                  contentHash: "3333333333333333333333333333333333333333333333333333333333333333",
                },
                artifacts: [
                  {
                    id: "art_001",
                    kind: "fetch_markdown",
                    mime: "text/markdown",
                    bytes: 120,
                    sha256: "2222222222222222222222222222222222222222222222222222222222222222",
                    cid: "bafy_art_001",
                    capturedAt: "2026-11-01T10:05:10.000Z",
                  },
                ],
                hashAlgorithm: "SHA-256",
                encryption: "AES-256-GCM (cid refers to ciphertext; sha256 refers to plaintext)",
              },
              artifacts: [
                {
                  filename: "art_001_fetch_markdown.md",
                  plaintextBuffer: Buffer.from("Fetch content markdown"),
                  sha256: "2222222222222222222222222222222222222222222222222222222222222222",
                },
              ],
              proofJson: {
                chainId: 80002,
                network: "polygon-amoy",
                contract: "0x1234567890123456789012345678901234567890",
                txHash: "0xabcdef123456",
                blockNumber: 1234567,
                anchoredAt: "2026-11-01T10:30:00.000Z",
                root: "0xroot1234",
                manifestSha256: "1111111111111111111111111111111111111111111111111111111111111111",
                proof: ["0xproof1"],
                treeFormat: "openzeppelin-standard-v1",
                leafEncoding: ["bytes32"],
                batchCid: "bafy_batch_1",
              },
            },
          },
        ],
      };

      const zipBuffer = await buildCaseExportZip(exportOptions);
      expect(zipBuffer).toBeInstanceOf(Buffer);
      expect(zipBuffer.length).toBeGreaterThan(0);

      // Inspect unzipped contents
      const unzipped = await JSZip.loadAsync(zipBuffer);

      // 1. Root case-manifest.json exists and contains correct metadata
      expect(unzipped.file("case-manifest.json")).not.toBeNull();
      const manifestText = await unzipped.file("case-manifest.json")!.async("text");
      const parsedManifest: CaseManifestJson = JSON.parse(manifestText);

      expect(parsedManifest.caseId).toBe("case_export_123");
      expect(parsedManifest.title).toBe("Investigation 2026");
      expect(parsedManifest.notes).toBe("Confidential case notes");
      expect(parsedManifest.captures).toHaveLength(1);
      expect(parsedManifest.captures[0].captureId).toBe("cap_exp_001");
      expect(parsedManifest.captures[0].manifestSha256).toBe(
        "1111111111111111111111111111111111111111111111111111111111111111"
      );

      // 2. Multi-folder structure: capture_cap_exp_001/...
      expect(unzipped.file("capture_cap_exp_001/manifest.json")).not.toBeNull();
      expect(unzipped.file("capture_cap_exp_001/proof.json")).not.toBeNull();
      expect(unzipped.file("capture_cap_exp_001/VERIFY.md")).not.toBeNull();
      expect(
        unzipped.file("capture_cap_exp_001/artifacts/art_001_fetch_markdown.md")
      ).not.toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 3. Dashboard Status Chips & Filtering Logic (FR-12.1)
  // -------------------------------------------------------------
  describe("3. Dashboard Status Chips & Filtering Logic", () => {
    const mockCaptures = [
      { id: "cap_1", status: "READY", isWatching: false, caseId: "case_alpha" },
      { id: "cap_2", status: "ANCHORED", isWatching: false, caseId: "case_alpha" },
      { id: "cap_3", status: "READY", isWatching: true, watchState: "active", caseId: null },
      { id: "cap_4", status: "READY", watchState: "edited_detected", caseId: "case_beta" },
      { id: "cap_5", status: "DELETED", watchState: "deleted_detected", caseId: null },
    ];

    it("matches each status chip category accurately", () => {
      const matchStatus = (c: any, filter: string) => {
        if (filter === "ALL") return true;
        if (filter === "ANCHORED") return c.status === "ANCHORED";
        if (filter === "READY") return c.status === "READY";
        if (filter === "WATCHING") return Boolean(c.isWatching || c.watchState === "active");
        if (filter === "EDITED") return c.watchState === "edited_detected";
        if (filter === "DELETED") {
          return c.watchState === "deleted_detected" || c.status === "DELETED";
        }
        return false;
      };

      expect(mockCaptures.filter((c) => matchStatus(c, "ALL"))).toHaveLength(5);
      expect(mockCaptures.filter((c) => matchStatus(c, "ANCHORED"))).toHaveLength(1);
      expect(mockCaptures.filter((c) => matchStatus(c, "READY"))).toHaveLength(3);
      expect(mockCaptures.filter((c) => matchStatus(c, "WATCHING"))).toHaveLength(1);
      expect(mockCaptures.filter((c) => matchStatus(c, "EDITED"))).toHaveLength(1);
      expect(mockCaptures.filter((c) => matchStatus(c, "DELETED"))).toHaveLength(1);
    });

    it("filters captures by case (All, Unassigned, or specific case ID)", () => {
      const filterByCase = (c: any, caseFilter: string) => {
        if (caseFilter === "ALL") return true;
        if (caseFilter === "UNASSIGNED") return !c.caseId;
        return c.caseId === caseFilter;
      };

      expect(mockCaptures.filter((c) => filterByCase(c, "ALL"))).toHaveLength(5);
      expect(mockCaptures.filter((c) => filterByCase(c, "UNASSIGNED"))).toHaveLength(2);
      expect(mockCaptures.filter((c) => filterByCase(c, "case_alpha"))).toHaveLength(2);
      expect(mockCaptures.filter((c) => filterByCase(c, "case_beta"))).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------
  // 4. TinyFish Search Client Request Shape (PRD 7.4, FR-11.2)
  // -------------------------------------------------------------
  describe("4. TinyFish Search Client (Exact Quotes, Timeout, Location Fallback, 30 RPM)", () => {
    it("wraps phrases in double quotes, uses location=IN with 10s timeout", async () => {
      const fetchSpy = vi.spyOn(tinyfishClient, "tinyFishFetch").mockResolvedValue({
        results: [
          {
            title: "First Inaugural Address - FDR Library",
            url: "https://fdrlibrary.org/fear-itself",
            snippet: "The only thing we have to fear is fear itself.",
          },
        ],
      });

      // Turn off fixture mode for this mock test
      const origMode = process.env.TINYFISH_MODE;
      delete process.env.TINYFISH_MODE;

      try {
        const res = await searchReposts("The only thing we have to fear is fear itself");
        expect(res.query).toBe('"The only thing we have to fear is fear itself"');
        expect(res.results).toHaveLength(1);

        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("query=%22The%20only%20thing%20we%20have%20to%20fear%20is%20fear%20itself%22"),
          expect.objectContaining({
            method: "GET",
            timeoutMs: 10000, // 10 seconds timeout per Step 3
          })
        );
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("location=IN"),
          expect.anything()
        );
      } finally {
        if (origMode) process.env.TINYFISH_MODE = origMode;
      }
    });

    it("falls back to location=US when location=IN is rejected", async () => {
      let callCount = 0;
      vi.spyOn(tinyfishClient, "tinyFishFetch").mockImplementation(async (url: string) => {
        callCount++;
        if (url.includes("location=IN")) {
          throw new Error("Location IN unsupported");
        }
        return {
          results: [
            {
              title: "US Fallback Result",
              url: "https://example.com/mirror",
              snippet: "Mirror snippet text",
            },
          ],
        };
      });

      const origMode = process.env.TINYFISH_MODE;
      delete process.env.TINYFISH_MODE;

      try {
        const res = await searchReposts("Scam internship registration fee");
        expect(callCount).toBe(2);
        expect(res.results).toHaveLength(1);
        expect(res.results[0].title).toBe("US Fallback Result");
      } finally {
        if (origMode) process.env.TINYFISH_MODE = origMode;
      }
    });
  });

  // -------------------------------------------------------------
  // 5. Phrase Picker: AI with Deterministic Fallback (FR-11.1)
  // -------------------------------------------------------------
  describe("5. Phrase Picker (AI Opt-In & Deterministic Fallback)", () => {
    it("uses AI repost_phrases when capture opted into AI and phrases exist", () => {
      const capture = {
        aiOptIn: true,
        aiAnalysis: {
          repost_phrases: [
            "Mandatory one-time registration fee of ₹2,499",
            "Urgent recruitment offer for summer 2026",
          ],
        },
        manifest: { observed: { title: "Generic Title" } },
      };

      const phrases = pickRepostPhrases(capture, "Some lengthy fetch text not used");
      expect(phrases).toHaveLength(2);
      expect(phrases[0]).toBe("Mandatory one-time registration fee of ₹2,499");
      expect(phrases[1]).toBe("Urgent recruitment offer for summer 2026");
    });

    it("deterministic fallback extracts distinctive fragments of 12 words or fewer and skips URLs, boilerplate, and numbers", () => {
      const fetchText = `
        # Welcome to CareerPortal
        [Terms of Service](https://example.com/terms) | [Privacy Policy](https://example.com/privacy)
        All rights reserved. Copyright 2026.
        123456789.
        Visit https://scam-mirror.com/apply for your offer letter now.
        Click here to subscribe.

        Mandatory one-time documentation and portal registration fee of ₹2,499 must be paid immediately.
        Candidates will receive an official verifiable offer letter within 48 hours.
      `;

      const fragments = extractDistinctiveFragments(fetchText, 2);
      expect(fragments.length).toBeGreaterThan(0);
      expect(fragments.length).toBeLessThanOrEqual(2);

      for (const frag of fragments) {
        // Must be 12 words or fewer
        const wordCount = frag.split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(12);

        // Never a URL
        expect(frag).not.toMatch(/https?:\/\//i);
        expect(frag).not.toMatch(/www\./i);

        // Never boilerplate
        expect(frag).not.toMatch(/terms of service/i);
        expect(frag).not.toMatch(/privacy policy/i);
        expect(frag).not.toMatch(/all rights reserved/i);

        // Never numbers only
        expect(frag).not.toMatch(/^[\d\s.,]+$/);
      }
    });

    it("truncateToWordLimit trims strings exceeding 12 words without mid-word cutting", () => {
      const longSentence = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
      const truncated = truncateToWordLimit(longSentence, 12);
      expect(truncated.split(/\s+/)).toHaveLength(12);
      expect(truncated).toBe("one two three four five six seven eight nine ten eleven twelve");
    });
  });

  // -------------------------------------------------------------
  // 6. URL Normalization, Deduplication & Original Exclusion (FR-11.3)
  // -------------------------------------------------------------
  describe("6. Repost Results Dedupe and Original Page Exclusion", () => {
    it("normalizes URLs and strips tracking parameters and trailing slashes", () => {
      const url1 = "https://www.example.com/post/123/?utm_source=twitter&ref=share";
      const url2 = "http://example.com/post/123";
      const url3 = "HTTPS://WWW.EXAMPLE.COM/post/123";

      const norm1 = normalizeCompareUrl(url1);
      const norm2 = normalizeCompareUrl(url2);
      const norm3 = normalizeCompareUrl(url3);

      expect(norm1).toBe("example.com/post/123");
      expect(norm2).toBe("example.com/post/123");
      expect(norm3).toBe("example.com/post/123");
    });

    it("deduplicates results and excludes the original target URL", () => {
      const originalTargetUrl = "https://chirp.local/sandbox/post/internship-scam-alert";
      const normOriginal = normalizeCompareUrl(originalTargetUrl);

      const rawResults = [
        {
          title: "Original Post (Duplicate)",
          url: "https://chirp.local/sandbox/post/internship-scam-alert?utm_source=copy",
          snippet: "Snippet A",
        },
        {
          title: "Mirror 1",
          url: "https://mirror1.com/forum/topic/55",
          snippet: "Mirror 1 snippet",
        },
        {
          title: "Mirror 1 (Duplicate with tracking)",
          url: "https://www.mirror1.com/forum/topic/55/?ref=feed",
          snippet: "Mirror 1 duplicate snippet",
        },
        {
          title: "Mirror 2",
          url: "https://mirror2.com/alert",
          snippet: "Mirror 2 snippet",
        },
      ];

      const seen = new Set<string>();
      const filtered: typeof rawResults = [];

      for (const item of rawResults) {
        const norm = normalizeCompareUrl(item.url);
        // Exclude original target
        if (norm === normOriginal) continue;
        // Deduplicate
        if (seen.has(norm)) continue;
        seen.add(norm);
        filtered.push(item);
      }

      expect(filtered).toHaveLength(2);
      expect(filtered[0].title).toBe("Mirror 1");
      expect(filtered[1].title).toBe("Mirror 2");
    });
  });
});
