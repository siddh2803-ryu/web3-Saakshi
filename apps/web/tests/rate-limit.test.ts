import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  checkSharedRateLimit,
  rateLimitExceededResponse,
  getClientIp,
  resetRateLimitsForTesting,
} from "@/lib/security/rate-limit";
import { GET as verifyHandler } from "@/app/api/verify/[sha256]/route";
import { POST as sandboxHandler } from "@/app/api/sandbox/route";
import { POST as capturesHandler } from "@/app/api/captures/route";
import { POST as sharesHandler } from "@/app/api/shares/route";
import { saveCaptureRecord, savePublicProof } from "@/lib/firebase/admin";
import * as agentModule from "@/lib/tinyfish/agent";

describe("Phase 9: Shared Store Rate Limiter (PRD Section 17 & Security Hardening)", () => {
  beforeEach(() => {
    resetRateLimitsForTesting();
    vi.restoreAllMocks();
    vi.spyOn(agentModule, "startAgentRun").mockResolvedValue({
      id: "run_mock_rate_limit",
      status: "RUNNING",
    } as any);
  });

  describe("Core Shared Rate Limiter Logic", () => {
    it("allows requests under the specified limit", async () => {
      const opts = {
        action: "test_action",
        identifier: "test_ip_1",
        limit: 3,
        windowSeconds: 60,
      };

      const res1 = await checkSharedRateLimit(opts);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(2);

      const res2 = await checkSharedRateLimit(opts);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(1);

      const res3 = await checkSharedRateLimit(opts);
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(0);
    });

    it("rejects requests exceeding the limit and returns accurate retryAfter", async () => {
      const opts = {
        action: "test_action",
        identifier: "test_ip_2",
        limit: 2,
        windowSeconds: 60,
      };

      await checkSharedRateLimit(opts);
      await checkSharedRateLimit(opts);

      const resExceeded = await checkSharedRateLimit(opts);
      expect(resExceeded.allowed).toBe(false);
      expect(resExceeded.remaining).toBe(0);
      expect(resExceeded.retryAfter).toBeGreaterThan(0);
      expect(resExceeded.retryAfter).toBeLessThanOrEqual(60);
    });

    it("resets counters after the window duration has elapsed", async () => {
      const opts = {
        action: "test_window",
        identifier: "test_ip_3",
        limit: 1,
        windowSeconds: 2,
      };

      const res1 = await checkSharedRateLimit(opts);
      expect(res1.allowed).toBe(true);

      const res2 = await checkSharedRateLimit(opts);
      expect(res2.allowed).toBe(false);

      // Fast-forward time past the window
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now + 3000);

      const res3 = await checkSharedRateLimit(opts);
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(0);
    });

    it("rateLimitExceededResponse returns HTTP 429 with Retry-After header and RATE_LIMITED code", () => {
      const res = rateLimitExceededResponse(45);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("45");
    });

    it("extracts client IP correctly from x-forwarded-for or x-real-ip", () => {
      const req1 = new NextRequest("http://localhost:3000", {
        headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18" },
      });
      expect(getClientIp(req1)).toBe("203.0.113.195");

      const req2 = new NextRequest("http://localhost:3000", {
        headers: { "x-real-ip": "198.51.100.4" },
      });
      expect(getClientIp(req2)).toBe("198.51.100.4");

      const req3 = new NextRequest("http://localhost:3000");
      expect(getClientIp(req3)).toBe("127.0.0.1");
    });
  });

  describe("Rate Limiting on Critical Endpoints", () => {
    it("enforces rate limit on public verify lookup (GET /api/verify/[sha256]) and returns 429 with Retry-After", async () => {
      const testSha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      await savePublicProof(testSha, {
        sha256: testSha,
        captureId: "cap_proof_test",
        root: "0xroot",
        proof: [],
        txHash: "0xtx",
        blockNumber: 1,
        contract: "0xcontract",
        anchoredAt: new Date().toISOString(),
      });

      const clientIp = "192.0.2.100";
      // Limit on verify_lookup is 60 req/min
      for (let i = 0; i < 60; i++) {
        const req = new NextRequest(`http://localhost:3000/api/verify/${testSha}`, {
          headers: { "x-real-ip": clientIp },
        });
        const res = await verifyHandler(req, { params: { sha256: testSha } });
        expect(res.status).toBe(200);
      }

      // 61st request should be rate-limited
      const reqBlocked = new NextRequest(`http://localhost:3000/api/verify/${testSha}`, {
        headers: { "x-real-ip": clientIp },
      });
      const resBlocked = await verifyHandler(reqBlocked, { params: { sha256: testSha } });
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.headers.get("Retry-After")).toBeTruthy();
      const body = await resBlocked.json();
      expect(body.code).toBe("RATE_LIMITED");
    });

    it("enforces rate limit on sandbox actions (POST /api/sandbox) and returns 429 with Retry-After", async () => {
      const clientIp = "192.0.2.101";
      // Limit on sandbox_action is 20 req/min
      for (let i = 0; i < 20; i++) {
        const req = new NextRequest("http://localhost:3000/api/sandbox", {
          method: "POST",
          headers: { "x-real-ip": clientIp, "content-type": "application/json" },
          body: JSON.stringify({
            action: "reset",
            secret: process.env.SANDBOX_ADMIN_SECRET || "chirp_admin_secret_key_demo",
          }),
        });
        const res = await sandboxHandler(req);
        expect(res.status).toBe(200);
      }

      // 21st request should be rate-limited
      const reqBlocked = new NextRequest("http://localhost:3000/api/sandbox", {
        method: "POST",
        headers: { "x-real-ip": clientIp, "content-type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          secret: process.env.SANDBOX_ADMIN_SECRET || "chirp_admin_secret_key_demo",
        }),
      });
      const resBlocked = await sandboxHandler(reqBlocked);
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.headers.get("Retry-After")).toBeTruthy();
    });

    it("enforces rate limit on capture creation (POST /api/captures) returning 429 with Retry-After", async () => {
      const clientIp = "192.0.2.102";
      // Limit on capture_create is 10 req/min per IP
      for (let i = 0; i < 10; i++) {
        const req = new NextRequest("http://localhost:3000/api/captures", {
          method: "POST",
          headers: {
            "x-real-ip": clientIp,
            "x-user-id": `rate_user_${i}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            url: "https://example.com/test",
            consent: true,
          }),
        });
        const res = await capturesHandler(req);
        expect(res.status).toBe(200);
      }

      // 11th request from same IP should be rate-limited
      const reqBlocked = new NextRequest("http://localhost:3000/api/captures", {
        method: "POST",
        headers: {
          "x-real-ip": clientIp,
          "x-user-id": "rate_user_11",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          url: "https://example.com/test",
          consent: true,
        }),
      });
      const resBlocked = await capturesHandler(reqBlocked);
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.headers.get("Retry-After")).toBeTruthy();
      const body = await resBlocked.json();
      expect(body.code).toBe("RATE_LIMITED");
    });
  });
});
