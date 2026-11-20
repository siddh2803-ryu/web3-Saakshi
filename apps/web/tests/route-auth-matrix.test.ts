import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Firebase and auth helpers
import {
  saveCaptureRecord,
  saveCaseRecord,
  saveWatchRecord,
  saveShareRecord,
  savePublicProof,
  saveArtifactRecord,
} from "@/lib/firebase/admin";
import { computeSha256 } from "@/lib/evidence/hash";

// Route module imports
import * as capturesRoute from "@/app/api/captures/route";
import * as captureIdRoute from "@/app/api/captures/[id]/route";
import * as captureArtifactRoute from "@/app/api/captures/[id]/artifacts/[artifactId]/route";
import * as captureBundleRoute from "@/app/api/captures/[id]/bundle/route";
import * as captureCertRoute from "@/app/api/captures/[id]/certificate/route";
import * as captureCustodyRoute from "@/app/api/captures/[id]/custody/route";
import * as captureCustodyRetryRoute from "@/app/api/captures/[id]/custody/[eventId]/retry/route";
import * as captureFinalizeRoute from "@/app/api/captures/[id]/finalize/route";
import * as captureRegenRoute from "@/app/api/captures/[id]/regenerate-analysis/route";
import * as captureRepostsRoute from "@/app/api/captures/[id]/reposts/route";
import * as captureRetryRoute from "@/app/api/captures/[id]/retry/route";
import * as captureSharesRoute from "@/app/api/captures/[id]/shares/route";
import * as captureShareRevokeRoute from "@/app/api/captures/[id]/shares/[shareId]/route";
import * as captureViewRoute from "@/app/api/captures/[id]/view/route";
import * as captureWatchRoute from "@/app/api/captures/[id]/watch/route";
import * as captureAnchorRoute from "@/app/api/captures/[id]/anchor/route";
import * as casesRoute from "@/app/api/cases/route";
import * as caseIdRoute from "@/app/api/cases/[id]/route";
import * as caseCapturesRoute from "@/app/api/cases/[id]/captures/route";
import * as caseExportRoute from "@/app/api/cases/[id]/export/route";
import * as watchesRoute from "@/app/api/watches/[id]/route";
import * as watchCheckRoute from "@/app/api/watches/[id]/check/route";
import * as sharesRoute from "@/app/api/shares/route";
import * as shareArtifactRoute from "@/app/api/shares/[token]/artifacts/[artifactId]/route";
import * as shareBundleRoute from "@/app/api/shares/[token]/bundle/route";
import * as verifyRoute from "@/app/api/verify/[sha256]/route";
import * as sandboxRoute from "@/app/api/sandbox/route";
import * as webhookTinyfishRoute from "@/app/api/webhooks/tinyfish/route";
import * as webhookMonitorRoute from "@/app/api/webhooks/monitor/route";

type CallerRole = "signed_out" | "mallory" | "alice";

interface RouteMatrixEntry {
  route: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  type: "private_owner" | "private_auth" | "protected_secret" | "public";
  execute: (caller: CallerRole) => Promise<{ status: number }>;
}

const ALICE_UID = "matrix_owner_alice";
const MALLORY_UID = "matrix_attacker_mallory";

const TEST_CAPTURE_ID = "cap_auth_matrix";
const TEST_CASE_ID = "case_auth_matrix";
const TEST_WATCH_ID = "watch_auth_matrix";
const TEST_SHARE_ID = "share_auth_matrix";
const TEST_SHARE_TOKEN = "tok_auth_matrix_12345678901234567890";
const TEST_TOKEN_HASH = computeSha256(TEST_SHARE_TOKEN);
const TEST_SHA256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function makeReq(url: string, method: string, caller: CallerRole, body?: any): NextRequest {
  const headers: Record<string, string> = {};
  if (caller === "signed_out") {
    headers["x-auth-signed-out"] = "true";
  } else if (caller === "alice") {
    headers["x-user-id"] = ALICE_UID;
  } else if (caller === "mallory") {
    headers["x-user-id"] = MALLORY_UID;
  }
  if (body) {
    headers["content-type"] = "application/json";
  }
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function discoverApiEndpoints(): string[] {
  const possiblePaths = [
    path.resolve(process.cwd(), "apps/web/app/api"),
    path.resolve(process.cwd(), "app/api"),
    path.resolve(__dirname, "../app/api"),
  ];
  const apiDir = possiblePaths.find((p) => fs.existsSync(p));
  if (!apiDir) throw new Error("Could not find app/api directory");
  const appRoot = path.dirname(apiDir);

  const endpoints: string[] = [];

  function walk(dir: string) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (file === "route.ts") {
        const content = fs.readFileSync(fullPath, "utf8");
        const relDir = path.relative(appRoot, dir).replace(/\\/g, "/");
        const routePath = "/" + relDir;
        const methods = ["GET", "POST", "PATCH", "DELETE", "PUT"].filter((m) =>
          new RegExp(`export\\s+async\\s+function\\s+${m}\\b`).test(content) ||
          new RegExp(`export\\s+function\\s+${m}\\b`).test(content)
        );
        for (const m of methods) {
          endpoints.push(`${m} ${routePath}`);
        }
      }
    }
  }

  walk(apiDir);
  endpoints.sort();
  return endpoints;
}

describe("Phase 9: API Route Authentication & Authorization Matrix", () => {
  beforeAll(async () => {
    // Seed Alice's capture
    await saveCaptureRecord(TEST_CAPTURE_ID, {
      id: TEST_CAPTURE_ID,
      ownerUid: ALICE_UID,
      url: "https://example.com/test",
      status: "READY",
      wrappedDek: "wrapped_dek_test_key",
      manifestSha256: TEST_SHA256,
      manifest: {
        captureId: TEST_CAPTURE_ID,
        timestamp: new Date().toISOString(),
        finalUrl: "https://example.com/test",
        artifacts: [],
      },
      watchId: TEST_WATCH_ID,
      isWatching: true,
    });

    await saveArtifactRecord(TEST_CAPTURE_ID, {
      id: "art_shot",
      kind: "screenshot",
      mime: "image/jpeg",
      sha256: "deadbeef",
      ciphertext: "deadbeef",
      iv: "0102030405060708090a0b0c",
      tag: "aabbccddaabbccddaabbccddaabbccdd",
      isDerivative: false,
    });

    // Seed Alice's case
    await saveCaseRecord(TEST_CASE_ID, {
      id: TEST_CASE_ID,
      ownerUid: ALICE_UID,
      title: "Alice Test Case",
      notes: "Private notes",
      captureIds: [TEST_CAPTURE_ID],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed Alice's watch
    await saveWatchRecord(TEST_WATCH_ID, {
      id: TEST_WATCH_ID,
      ownerUid: ALICE_UID,
      captureId: TEST_CAPTURE_ID,
      monitorId: "mon_matrix_test",
      state: "active",
      createdAt: new Date().toISOString(),
    });

    // Seed Alice's share record
    await saveShareRecord({
      id: TEST_SHARE_ID,
      captureId: TEST_CAPTURE_ID,
      ownerUid: ALICE_UID,
      tokenHash: TEST_TOKEN_HASH,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      revoked: false,
      includeAi: true,
      createdAt: new Date().toISOString(),
    });

    // Seed public proof
    await savePublicProof(TEST_SHA256, {
      sha256: TEST_SHA256,
      captureId: TEST_CAPTURE_ID,
      root: "0x" + "a".repeat(64),
      proof: [],
      txHash: "0x" + "b".repeat(64),
      blockNumber: 100,
      contract: "0x" + "c".repeat(40),
      anchoredAt: new Date().toISOString(),
    });
  });

  const matrix: RouteMatrixEntry[] = [
    // /api/captures
    {
      route: "/api/captures",
      method: "GET",
      type: "private_auth",
      execute: async (caller) =>
        capturesRoute.GET(makeReq("http://localhost:3000/api/captures", "GET", caller)),
    },
    {
      route: "/api/captures",
      method: "POST",
      type: "private_auth",
      execute: async (caller) =>
        capturesRoute.POST(
          makeReq("http://localhost:3000/api/captures", "POST", caller, {
            url: "https://example.com/item",
            consent: true,
          })
        ),
    },

    // /api/captures/[id]
    {
      route: "/api/captures/[id]",
      method: "GET",
      type: "private_owner",
      execute: async (caller) =>
        captureIdRoute.GET(
          makeReq(`http://localhost:3000/api/captures/${TEST_CAPTURE_ID}`, "GET", caller),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },
    {
      route: "/api/captures/[id]",
      method: "PATCH",
      type: "private_owner",
      execute: async (caller) =>
        captureIdRoute.PATCH(
          makeReq(`http://localhost:3000/api/captures/${TEST_CAPTURE_ID}`, "PATCH", caller, {
            caseId: TEST_CASE_ID,
          }),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },
    {
      route: "/api/captures/[id]",
      method: "DELETE",
      type: "private_owner",
      execute: async (caller) =>
        captureIdRoute.DELETE(
          makeReq(`http://localhost:3000/api/captures/${TEST_CAPTURE_ID}`, "DELETE", caller),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/artifacts/[artifactId]
    {
      route: "/api/captures/[id]/artifacts/[artifactId]",
      method: "GET",
      type: "private_owner",
      execute: async (caller) =>
        captureArtifactRoute.GET(
          makeReq(
            `http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/artifacts/art_shot`,
            "GET",
            caller
          ),
          { params: { id: TEST_CAPTURE_ID, artifactId: "art_shot" } }
        ),
    },

    // /api/captures/[id]/bundle
    {
      route: "/api/captures/[id]/bundle",
      method: "GET",
      type: "private_owner",
      execute: async (caller) =>
        captureBundleRoute.GET(
          makeReq(`http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/bundle`, "GET", caller),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/certificate
    {
      route: "/api/captures/[id]/certificate",
      method: "GET",
      type: "private_owner",
      execute: async (caller) =>
        captureCertRoute.GET(
          makeReq(
            `http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/certificate`,
            "GET",
            caller
          ),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/retry
    {
      route: "/api/captures/[id]/retry",
      method: "POST",
      type: "private_owner",
      execute: async (caller) =>
        captureRetryRoute.POST(
          makeReq(`http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/retry`, "POST", caller),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/finalize
    {
      route: "/api/captures/[id]/finalize",
      method: "POST",
      type: "private_owner",
      execute: async (caller) =>
        captureFinalizeRoute.POST(
          makeReq(
            `http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/finalize`,
            "POST",
            caller
          ),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/anchor
    {
      route: "/api/captures/[id]/anchor",
      method: "POST",
      type: "private_owner",
      execute: async (caller) =>
        captureAnchorRoute.POST(
          makeReq(
            `http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/anchor`,
            "POST",
            caller
          ),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/watch
    {
      route: "/api/captures/[id]/watch",
      method: "GET",
      type: "private_owner",
      execute: async (caller) =>
        captureWatchRoute.GET(
          makeReq(`http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/watch`, "GET", caller),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },
    {
      route: "/api/captures/[id]/watch",
      method: "POST",
      type: "private_owner",
      execute: async (caller) =>
        captureWatchRoute.POST(
          makeReq(`http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/watch`, "POST", caller, {
            scheduleCron: "0 */6 * * *",
          }),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },
    {
      route: "/api/captures/[id]/watch",
      method: "DELETE",
      type: "private_owner",
      execute: async (caller) =>
        captureWatchRoute.DELETE(
          makeReq(
            `http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/watch`,
            "DELETE",
            caller
          ),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/reposts
    {
      route: "/api/captures/[id]/reposts",
      method: "POST",
      type: "private_owner",
      execute: async (caller) =>
        captureRepostsRoute.POST(
          makeReq(
            `http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/reposts`,
            "POST",
            caller,
            { phrases: ["test phrase"] }
          ),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/regenerate-analysis
    {
      route: "/api/captures/[id]/regenerate-analysis",
      method: "POST",
      type: "private_owner",
      execute: async (caller) =>
        captureRegenRoute.POST(
          makeReq(
            `http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/regenerate-analysis`,
            "POST",
            caller
          ),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/view
    {
      route: "/api/captures/[id]/view",
      method: "POST",
      type: "private_auth",
      execute: async (caller) =>
        captureViewRoute.POST(
          makeReq(`http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/view`, "POST", caller),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/custody
    {
      route: "/api/captures/[id]/custody",
      method: "GET",
      type: "private_owner",
      execute: async (caller) =>
        captureCustodyRoute.GET(
          makeReq(
            `http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/custody`,
            "GET",
            caller
          ),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/custody/[eventId]/retry
    {
      route: "/api/captures/[id]/custody/[eventId]/retry",
      method: "POST",
      type: "private_owner",
      execute: async (caller) =>
        captureCustodyRetryRoute.POST(
          makeReq(
            `http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/custody/event_1/retry`,
            "POST",
            caller
          ),
          { params: { id: TEST_CAPTURE_ID, eventId: "event_1" } }
        ),
    },

    // /api/captures/[id]/shares
    {
      route: "/api/captures/[id]/shares",
      method: "GET",
      type: "private_owner",
      execute: async (caller) =>
        captureSharesRoute.GET(
          makeReq(`http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/shares`, "GET", caller),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },
    {
      route: "/api/captures/[id]/shares",
      method: "POST",
      type: "private_owner",
      execute: async (caller) =>
        captureSharesRoute.POST(
          makeReq(
            `http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/shares`,
            "POST",
            caller,
            { duration: "7d" }
          ),
          { params: { id: TEST_CAPTURE_ID } }
        ),
    },

    // /api/captures/[id]/shares/[shareId]
    {
      route: "/api/captures/[id]/shares/[shareId]",
      method: "DELETE",
      type: "private_owner",
      execute: async (caller) =>
        captureShareRevokeRoute.DELETE(
          makeReq(
            `http://localhost:3000/api/captures/${TEST_CAPTURE_ID}/shares/${TEST_SHARE_ID}`,
            "DELETE",
            caller
          ),
          { params: { id: TEST_CAPTURE_ID, shareId: TEST_SHARE_ID } }
        ),
    },

    // /api/shares
    {
      route: "/api/shares",
      method: "POST",
      type: "private_owner",
      execute: async (caller) =>
        sharesRoute.POST(
          makeReq("http://localhost:3000/api/shares", "POST", caller, {
            captureId: TEST_CAPTURE_ID,
            duration: "7d",
          })
        ),
    },

    // /api/shares/[token]/artifacts/[artifactId] (Public with valid token)
    {
      route: "/api/shares/[token]/artifacts/[artifactId]",
      method: "GET",
      type: "public",
      execute: async (caller) =>
        shareArtifactRoute.GET(
          makeReq(
            `http://localhost:3000/api/shares/${TEST_SHARE_TOKEN}/artifacts/art_shot`,
            "GET",
            caller
          ),
          { params: { token: TEST_SHARE_TOKEN, artifactId: "art_shot" } }
        ),
    },

    // /api/shares/[token]/bundle (Public with valid token)
    {
      route: "/api/shares/[token]/bundle",
      method: "GET",
      type: "public",
      execute: async (caller) =>
        shareBundleRoute.GET(
          makeReq(
            `http://localhost:3000/api/shares/${TEST_SHARE_TOKEN}/bundle`,
            "GET",
            caller
          ),
          { params: { token: TEST_SHARE_TOKEN } }
        ),
    },

    // /api/cases
    {
      route: "/api/cases",
      method: "GET",
      type: "private_auth",
      execute: async (caller) =>
        casesRoute.GET(makeReq("http://localhost:3000/api/cases", "GET", caller)),
    },
    {
      route: "/api/cases",
      method: "POST",
      type: "private_auth",
      execute: async (caller) =>
        casesRoute.POST(
          makeReq("http://localhost:3000/api/cases", "POST", caller, {
            title: "New Case",
          })
        ),
    },

    // /api/cases/[id]
    {
      route: "/api/cases/[id]",
      method: "GET",
      type: "private_owner",
      execute: async (caller) =>
        caseIdRoute.GET(
          makeReq(`http://localhost:3000/api/cases/${TEST_CASE_ID}`, "GET", caller),
          { params: { id: TEST_CASE_ID } }
        ),
    },
    {
      route: "/api/cases/[id]",
      method: "PATCH",
      type: "private_owner",
      execute: async (caller) =>
        caseIdRoute.PATCH(
          makeReq(`http://localhost:3000/api/cases/${TEST_CASE_ID}`, "PATCH", caller, {
            title: "Updated Title",
          }),
          { params: { id: TEST_CASE_ID } }
        ),
    },
    {
      route: "/api/cases/[id]",
      method: "DELETE",
      type: "private_owner",
      execute: async (caller) =>
        caseIdRoute.DELETE(
          makeReq(`http://localhost:3000/api/cases/${TEST_CASE_ID}`, "DELETE", caller),
          { params: { id: TEST_CASE_ID } }
        ),
    },

    // /api/cases/[id]/captures
    {
      route: "/api/cases/[id]/captures",
      method: "POST",
      type: "private_owner",
      execute: async (caller) =>
        caseCapturesRoute.POST(
          makeReq(
            `http://localhost:3000/api/cases/${TEST_CASE_ID}/captures`,
            "POST",
            caller,
            { captureId: TEST_CAPTURE_ID }
          ),
          { params: { id: TEST_CASE_ID } }
        ),
    },
    {
      route: "/api/cases/[id]/captures",
      method: "DELETE",
      type: "private_owner",
      execute: async (caller) =>
        caseCapturesRoute.DELETE(
          makeReq(
            `http://localhost:3000/api/cases/${TEST_CASE_ID}/captures`,
            "DELETE",
            caller,
            { captureId: TEST_CAPTURE_ID }
          ),
          { params: { id: TEST_CASE_ID } }
        ),
    },

    // /api/cases/[id]/export
    {
      route: "/api/cases/[id]/export",
      method: "GET",
      type: "private_owner",
      execute: async (caller) =>
        caseExportRoute.GET(
          makeReq(`http://localhost:3000/api/cases/${TEST_CASE_ID}/export`, "GET", caller),
          { params: { id: TEST_CASE_ID } }
        ),
    },

    // /api/watches/[id]
    {
      route: "/api/watches/[id]",
      method: "GET",
      type: "private_owner",
      execute: async (caller) =>
        watchesRoute.GET(
          makeReq(`http://localhost:3000/api/watches/${TEST_WATCH_ID}`, "GET", caller),
          { params: { id: TEST_WATCH_ID } }
        ),
    },
    {
      route: "/api/watches/[id]",
      method: "PATCH",
      type: "private_owner",
      execute: async (caller) =>
        watchesRoute.PATCH(
          makeReq(`http://localhost:3000/api/watches/${TEST_WATCH_ID}`, "PATCH", caller, {
            state: "paused",
          }),
          { params: { id: TEST_WATCH_ID } }
        ),
    },
    {
      route: "/api/watches/[id]",
      method: "DELETE",
      type: "private_owner",
      execute: async (caller) =>
        watchesRoute.DELETE(
          makeReq(`http://localhost:3000/api/watches/${TEST_WATCH_ID}`, "DELETE", caller),
          { params: { id: TEST_WATCH_ID } }
        ),
    },

    // /api/watches/[id]/check
    {
      route: "/api/watches/[id]/check",
      method: "POST",
      type: "private_owner",
      execute: async (caller) =>
        watchCheckRoute.POST(
          makeReq(`http://localhost:3000/api/watches/${TEST_WATCH_ID}/check`, "POST", caller),
          { params: { id: TEST_WATCH_ID } }
        ),
    },

    // /api/verify/[sha256] (Public)
    {
      route: "/api/verify/[sha256]",
      method: "GET",
      type: "public",
      execute: async (caller) =>
        verifyRoute.GET(
          makeReq(`http://localhost:3000/api/verify/${TEST_SHA256}`, "GET", caller),
          { params: { sha256: TEST_SHA256 } }
        ),
    },

    // /api/sandbox
    {
      route: "/api/sandbox",
      method: "GET",
      type: "public",
      execute: async () => sandboxRoute.GET(),
    },
    {
      route: "/api/sandbox",
      method: "POST",
      type: "protected_secret",
      execute: async (caller) =>
        sandboxRoute.POST(
          makeReq("http://localhost:3000/api/sandbox", "POST", caller, {
            action: "reset",
            secret: "wrong_secret_for_unauthorized_test",
          })
        ),
    },

    // /api/webhooks/tinyfish
    {
      route: "/api/webhooks/tinyfish",
      method: "POST",
      type: "protected_secret",
      execute: async (caller) =>
        webhookTinyfishRoute.POST(
          makeReq(
            "http://localhost:3000/api/webhooks/tinyfish?token=invalid_token",
            "POST",
            caller
          )
        ),
    },

    // /api/webhooks/monitor
    {
      route: "/api/webhooks/monitor",
      method: "POST",
      type: "protected_secret",
      execute: async (caller) =>
        webhookMonitorRoute.POST(
          makeReq(
            "http://localhost:3000/api/webhooks/monitor?token=invalid_token",
            "POST",
            caller
          )
        ),
    },
  ];

  it("dynamically discovers all API route files and asserts every route and method is listed", () => {
    const discovered = discoverApiEndpoints();
    const matrixEndpoints = matrix.map((m) => `${m.method} ${m.route}`).sort();

    expect(discovered).toEqual(matrixEndpoints);
    expect(matrix.length).toBe(42);
  });

  describe("Signed-out access to private & protected routes returns 401 or 403", () => {
    const nonPublicRoutes = matrix.filter((m) => m.type !== "public");

    it.each(nonPublicRoutes)(
      "$method $route returns 401 or 403 when signed out",
      async ({ execute }) => {
        const res = await execute("signed_out");
        expect([401, 403]).toContain(res.status);
      }
    );
  });

  describe("Cross-user access to owner-only private routes returns 403 or 401", () => {
    const ownerRoutes = matrix.filter((m) => m.type === "private_owner");

    it.each(ownerRoutes)(
      "$method $route returns 403 or 401 when accessed by a different user (mallory)",
      async ({ execute }) => {
        const res = await execute("mallory");
        expect([401, 403]).toContain(res.status);
      }
    );
  });

  describe("Signed-out access to public routes succeeds", () => {
    const publicRoutes = matrix.filter((m) => m.type === "public");

    it.each(publicRoutes)(
      "$method $route succeeds when signed out",
      async ({ execute }) => {
        const res = await execute("signed_out");
        expect(res.status).toBeLessThan(400);
      }
    );
  });
});
