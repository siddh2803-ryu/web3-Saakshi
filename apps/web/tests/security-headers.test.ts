import { describe, it, expect } from "vitest";
import nextConfig from "../next.config.mjs";

describe("Phase 9: Security Headers & Content Security Policy (PRD Section 17)", () => {
  it("defines comprehensive security headers for all routes and specific policies for share routes", async () => {
    const headerRules = await nextConfig.headers!();

    // Check share route headers
    const shareViewRule = headerRules.find((r: any) => r.source === "/s/:path*");
    expect(shareViewRule).toBeDefined();
    const shareViewReferrer = shareViewRule!.headers.find((h: any) => h.key === "Referrer-Policy");
    expect(shareViewReferrer?.value).toBe("no-referrer");

    const shareApiRule = headerRules.find((r: any) => r.source === "/api/shares/:path*");
    expect(shareApiRule).toBeDefined();
    const shareApiReferrer = shareApiRule!.headers.find((h: any) => h.key === "Referrer-Policy");
    expect(shareApiReferrer?.value).toBe("no-referrer");

    // Check global headers
    const globalRule = headerRules.find((r: any) => r.source === "/:path*");
    expect(globalRule).toBeDefined();
    const headersMap = new Map(globalRule!.headers.map((h: any) => [h.key, h.value]));

    // 1. Content-Security-Policy
    const csp = headersMap.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("stream.tinyfish.ai");
    expect(csp).toContain("accounts.google.com");
    expect(csp).toContain("identitytoolkit.googleapis.com");
    expect(csp).toContain("gateway.pinata.cloud");

    // 2. Referrer-Policy
    expect(headersMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");

    // 3. X-Content-Type-Options
    expect(headersMap.get("X-Content-Type-Options")).toBe("nosniff");

    // 4. X-Frame-Options
    expect(headersMap.get("X-Frame-Options")).toBe("DENY");

    // 5. Permissions-Policy
    expect(headersMap.get("Permissions-Policy")).toContain("camera=()");
    expect(headersMap.get("Permissions-Policy")).toContain("microphone=()");
    expect(headersMap.get("Permissions-Policy")).toContain("geolocation=()");
  });

  it("includes Strict-Transport-Security (HSTS) when NODE_ENV is production", async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      const headerRules = await nextConfig.headers!();
      const globalRule = headerRules.find((r: any) => r.source === "/:path*");
      const hstsHeader = globalRule!.headers.find((h: any) => h.key === "Strict-Transport-Security");
      expect(hstsHeader).toBeDefined();
      expect(hstsHeader!.value).toContain("max-age=63072000");
      expect(hstsHeader!.value).toContain("includeSubDomains");
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
    }
  });
});
