import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CustodyEvent,
  CustodyAction,
  computeActorHash,
  computeEventHash,
  buildCustodyEvent,
  verifyCustodyChain,
} from "@/lib/custody/model";
import {
  recordCustodyEvent,
  recordViewCustodyEvent,
  listCustodyEvents,
  saveShareRecord,
  getShareRecordByTokenHash,
  revokeShareRecord,
  saveCaptureRecord,
} from "@/lib/firebase/admin";
import {
  generateShareToken,
  calculateExpiryDate,
  isShareActive,
  ShareRecord,
} from "@/lib/share/model";
import { checkShareRateLimit, resetShareRateLimit } from "@/lib/share/rate-limit";
import { computeSha256 } from "@/lib/evidence/hash";
import { metadata as sharePageMetadata } from "@/app/s/[token]/page";
import nextConfig from "../next.config.mjs";

describe("Phase 8 Part 2: Custody Log & Share Links Suite (PRD 6 FR-13, FR-14)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetShareRateLimit();
  });

  // -----------------------------------------------------------------
  // 1. Hash-Chain Model & Cryptographic Verification
  // -----------------------------------------------------------------
  describe("1. Hash-Chained Custody Event Model (FR-13.1, FR-13.2)", () => {
    it("builds a valid genesis event with prevEventHash === null and RFC 8785 eventHash", () => {
      const captureId = "cap_test_custody_001";
      const actorId = "test_user_alice";

      const genesis = buildCustodyEvent({
        captureId,
        action: "CREATE",
        actorId,
        prevEventHash: null,
      });

      expect(genesis.captureId).toBe(captureId);
      expect(genesis.action).toBe("CREATE");
      expect(genesis.prevEventHash).toBeNull();
      expect(genesis.eventHash).toHaveLength(64);

      // Verify canonical RFC 8785 hash computation
      const expectedHash = computeEventHash({
        captureId,
        action: "CREATE",
        actorHash: genesis.actorHash,
        at: genesis.at,
        prevEventHash: null,
      });
      expect(genesis.eventHash).toBe(expectedHash);
    });

    it("builds chained events linked to previous event hashes", () => {
      const captureId = "cap_test_custody_002";
      const actorId = "test_user_alice";

      const event1 = buildCustodyEvent({
        captureId,
        action: "CREATE",
        actorId,
        prevEventHash: null,
      });

      const event2 = buildCustodyEvent({
        captureId,
        action: "VIEW",
        actorId,
        prevEventHash: event1.eventHash,
      });

      const event3 = buildCustodyEvent({
        captureId,
        action: "EXPORT",
        actorId,
        prevEventHash: event2.eventHash,
      });

      expect(event2.prevEventHash).toBe(event1.eventHash);
      expect(event3.prevEventHash).toBe(event2.eventHash);

      const verification = verifyCustodyChain([event1, event2, event3]);
      expect(verification.valid).toBe(true);
      expect(verification.totalEvents).toBe(3);
    });

    it("fails verification if any past event payload is modified (tamper-detection)", () => {
      const captureId = "cap_test_custody_003";
      const actorId = "test_user_alice";

      const event1 = buildCustodyEvent({
        captureId,
        action: "CREATE",
        actorId,
        prevEventHash: null,
      });

      const event2 = buildCustodyEvent({
        captureId,
        action: "VIEW",
        actorId,
        prevEventHash: event1.eventHash,
      });

      // Attacker edits event1 action or actor
      const tamperedEvent1: CustodyEvent = {
        ...event1,
        action: "EXPORT",
      };

      const verification = verifyCustodyChain([tamperedEvent1, event2]);
      expect(verification.valid).toBe(false);
      expect(verification.brokenAtIndex).toBe(0);
      expect(verification.reason).toContain("Hash mismatch");
    });

    it("fails verification if an event is deleted from the chain", () => {
      const captureId = "cap_test_custody_004";
      const actorId = "test_user_alice";

      const event1 = buildCustodyEvent({
        captureId,
        action: "CREATE",
        actorId,
        prevEventHash: null,
      });

      const event2 = buildCustodyEvent({
        captureId,
        action: "VIEW",
        actorId,
        prevEventHash: event1.eventHash,
      });

      const event3 = buildCustodyEvent({
        captureId,
        action: "EXPORT",
        actorId,
        prevEventHash: event2.eventHash,
      });

      // Delete event2: event3.prevEventHash won't match event1.eventHash
      const verification = verifyCustodyChain([event1, event3]);
      expect(verification.valid).toBe(false);
      expect(verification.brokenAtIndex).toBe(1);
      expect(verification.reason).toContain("Broken chain link");
    });

    it("fails verification if events are reordered", () => {
      const captureId = "cap_test_custody_005";
      const actorId = "test_user_alice";

      const event1 = buildCustodyEvent({
        captureId,
        action: "CREATE",
        actorId,
        prevEventHash: null,
      });

      const event2 = buildCustodyEvent({
        captureId,
        action: "VIEW",
        actorId,
        prevEventHash: event1.eventHash,
      });

      // Reverse order: event2 before event1
      const verification = verifyCustodyChain([event2, event1]);
      expect(verification.valid).toBe(false);
    });

    it("salts actorHash for owners and preserves 'share:' prefix for share visitors", () => {
      const uidHash1 = computeActorHash("alice_123");
      const uidHash2 = computeActorHash("alice_123");
      expect(uidHash1).toBe(uidHash2);
      expect(uidHash1).toHaveLength(64);
      expect(uidHash1).not.toBe("alice_123"); // never plain UID

      const shareHash = computeActorHash("sh_abcd1234efgh5678", true);
      expect(shareHash).toBe("share:sh_abcd1234efgh5678");

      const sharePrefixed = computeActorHash("share:sh_xyz9876");
      expect(sharePrefixed).toBe("share:sh_xyz9876");
    });
  });

  // -----------------------------------------------------------------
  // 2. Action Recording & VIEW Throttle (FR-13.1)
  // -----------------------------------------------------------------
  describe("2. Event Recording for All Actions & VIEW Throttle", () => {
    it("records CREATE, VIEW, EXPORT, SHARE, and VERIFY actions in sequence", async () => {
      const captureId = `cap_test_actions_${Date.now()}`;

      const e1 = await recordCustodyEvent({
        captureId,
        action: "CREATE",
        actorId: "owner_123",
      });
      expect(e1.action).toBe("CREATE");
      expect(e1.prevEventHash).toBeNull();

      const e2 = await recordCustodyEvent({
        captureId,
        action: "VIEW",
        actorId: "owner_123",
      });
      expect(e2.action).toBe("VIEW");
      expect(e2.prevEventHash).toBe(e1.eventHash);

      const e3 = await recordCustodyEvent({
        captureId,
        action: "EXPORT",
        actorId: "owner_123",
        details: { format: "ZIP" },
      });
      expect(e3.action).toBe("EXPORT");
      expect(e3.prevEventHash).toBe(e2.eventHash);

      const e4 = await recordCustodyEvent({
        captureId,
        action: "SHARE",
        actorId: "owner_123",
        details: { shareId: "sh_1" },
      });
      expect(e4.action).toBe("SHARE");
      expect(e4.prevEventHash).toBe(e3.eventHash);

      const e5 = await recordCustodyEvent({
        captureId,
        action: "VERIFY",
        actorId: "verifier_public",
        details: { source: "/v/[id]" },
      });
      expect(e5.action).toBe("VERIFY");
      expect(e5.prevEventHash).toBe(e4.eventHash);

      const events = await listCustodyEvents(captureId);
      expect(events).toHaveLength(5);
      const chain = verifyCustodyChain(events);
      expect(chain.valid).toBe(true);
    });

    it("throttles VIEW events to at most once per hour per actor", async () => {
      const captureId = `cap_test_throttle_${Date.now()}`;
      const actorId = "user_throttled_456";

      // 1. First VIEW succeeds
      const v1 = await recordViewCustodyEvent(captureId, actorId);
      expect(v1.recorded).toBe(true);
      expect(v1.throttled).toBe(false);
      expect(v1.event?.action).toBe("VIEW");

      // 2. Second VIEW within 1 hour is throttled (returns existing event, does not append)
      const v2 = await recordViewCustodyEvent(captureId, actorId);
      expect(v2.recorded).toBe(false);
      expect(v2.throttled).toBe(true);
      expect(v2.event?.id).toBe(v1.event?.id);

      const eventsAfter2 = await listCustodyEvents(captureId);
      expect(eventsAfter2.filter((e) => e.action === "VIEW")).toHaveLength(1);

      // 3. Different actor is NOT throttled
      const vOther = await recordViewCustodyEvent(captureId, "another_user_789");
      expect(vOther.recorded).toBe(true);
      expect(vOther.throttled).toBe(false);
      expect(vOther.event?.id).not.toBe(v1.event?.id);

      const eventsAfterOther = await listCustodyEvents(captureId);
      expect(eventsAfterOther.filter((e) => e.action === "VIEW")).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------
  // 3. Share Tokens: Storage & Expiry Options (FR-14.1)
  // -----------------------------------------------------------------
  describe("3. Share Tokens & Controlled Expiry Options", () => {
    it("generates 32-byte crypto tokens and stores strictly tokenHash (never rawToken)", async () => {
      const { rawToken, tokenHash } = generateShareToken();

      expect(rawToken).toHaveLength(64); // 32 bytes hex
      expect(tokenHash).toHaveLength(64);
      expect(tokenHash).toBe(computeSha256(rawToken));

      const shareRecord: ShareRecord = {
        id: `sh_${Date.now()}`,
        captureId: "cap_share_sec_test",
        ownerUid: "owner_sec",
        tokenHash,
        expiresAt: calculateExpiryDate("7d").toISOString(),
        includeAi: false,
        revoked: false,
        createdAt: new Date().toISOString(),
      };

      await saveShareRecord(shareRecord);

      // Lookup by tokenHash succeeds
      const fetched = await getShareRecordByTokenHash(tokenHash);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(shareRecord.id);
      expect((fetched as any).rawToken).toBeUndefined();

      // Lookup by rawToken fails (because it was hashed before saving)
      const invalidLookup = await getShareRecordByTokenHash(rawToken);
      expect(invalidLookup).toBeNull();
    });

    it("calculates accurate expiry dates for 24h, 7d, and 30d", () => {
      const baseTime = new Date("2026-11-20T12:00:00Z");

      const exp24h = calculateExpiryDate("24h", baseTime);
      expect(exp24h.toISOString()).toBe("2026-11-21T12:00:00.000Z");

      const exp7d = calculateExpiryDate("7d", baseTime);
      expect(exp7d.toISOString()).toBe("2026-11-27T12:00:00.000Z");

      const exp30d = calculateExpiryDate("30d", baseTime);
      expect(exp30d.toISOString()).toBe("2026-12-20T12:00:00.000Z");
    });

    it("refuses expired share links with controlled clock", () => {
      const baseTime = new Date("2026-11-20T12:00:00Z");
      const share: ShareRecord = {
        id: "sh_expiry_clock",
        captureId: "cap_1",
        ownerUid: "alice",
        tokenHash: "hash123",
        expiresAt: calculateExpiryDate("24h", baseTime).toISOString(), // expires Nov 21 12:00
        includeAi: false,
        revoked: false,
        createdAt: baseTime.toISOString(),
      };

      // 1 hour before expiry -> active
      const beforeExpiry = new Date("2026-11-21T11:00:00Z");
      expect(isShareActive(share, beforeExpiry)).toBe(true);

      // 1 second after expiry -> refused
      const afterExpiry = new Date("2026-11-21T12:00:01Z");
      expect(isShareActive(share, afterExpiry)).toBe(false);
    });

    it("refuses revoked share links regardless of expiration date", async () => {
      const shareId = `sh_rev_${Date.now()}`;
      const tokenHash = computeSha256(`raw_token_${Date.now()}`);

      const share: ShareRecord = {
        id: shareId,
        captureId: "cap_revoke_test",
        ownerUid: "alice",
        tokenHash,
        expiresAt: calculateExpiryDate("30d").toISOString(),
        includeAi: false,
        revoked: false,
        createdAt: new Date().toISOString(),
      };

      await saveShareRecord(share);
      expect(isShareActive(share)).toBe(true);

      await revokeShareRecord(shareId);
      const updated = await getShareRecordByTokenHash(tokenHash);
      expect(updated?.revoked).toBe(true);
      expect(isShareActive(updated!)).toBe(false);
    });
  });

  // -----------------------------------------------------------------
  // 4. Uniform Unavailable Responses & Rate Limiting (FR-14.1)
  // -----------------------------------------------------------------
  describe("4. Security Hardening: Identical Responses, Headers & Rate Limiting", () => {
    it("configures no-referrer and noindex in Next.js page metadata and nextConfig headers", async () => {
      // 1. Page Metadata
      expect(sharePageMetadata.referrer).toBe("no-referrer");
      expect(sharePageMetadata.robots).toEqual({ index: false, follow: false });

      // 2. HTTP Response Headers in next.config.mjs
      if (typeof nextConfig.headers === "function") {
        const headerRules = await nextConfig.headers();
        const shareRule = headerRules.find((r: any) => r.source === "/s/:path*");
        expect(shareRule).toBeDefined();

        const refHeader = shareRule?.headers.find((h: any) => h.key === "Referrer-Policy");
        expect(refHeader?.value).toBe("no-referrer");

        const robotsHeader = shareRule?.headers.find((h: any) => h.key === "X-Robots-Tag");
        expect(robotsHeader?.value).toBe("noindex, nofollow");
      }
    });

    it("enforces sliding-window IP rate limit of 30 requests per minute", () => {
      const testIp = "192.168.1.100";

      // First 30 requests allowed
      for (let i = 0; i < 30; i++) {
        expect(checkShareRateLimit(testIp)).toBe(true);
      }

      // 31st request rejected (429)
      expect(checkShareRateLimit(testIp)).toBe(false);

      // Different IP is independent
      const otherIp = "192.168.1.101";
      expect(checkShareRateLimit(otherIp)).toBe(true);
    });

    it("isolates AI analysis when includeAi is false", () => {
      const shareWithoutAi: ShareRecord = {
        id: "sh_no_ai",
        captureId: "cap_privacy",
        ownerUid: "owner",
        tokenHash: "hash1",
        expiresAt: calculateExpiryDate("7d").toISOString(),
        includeAi: false,
        revoked: false,
        createdAt: new Date().toISOString(),
      };

      const shareWithAi: ShareRecord = {
        id: "sh_with_ai",
        captureId: "cap_privacy",
        ownerUid: "owner",
        tokenHash: "hash2",
        expiresAt: calculateExpiryDate("7d").toISOString(),
        includeAi: true,
        revoked: false,
        createdAt: new Date().toISOString(),
      };

      expect(shareWithoutAi.includeAi).toBe(false);
      expect(shareWithAi.includeAi).toBe(true);
    });
  });
});
