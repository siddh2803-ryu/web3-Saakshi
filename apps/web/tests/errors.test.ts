import { describe, it, expect } from "vitest";
import { createApiError, handleRouteError } from "@/lib/errors/api-error";

describe("Phase 9: Uniform API Errors & Production Leakage Guards (PRD Section 17)", () => {
  it("createApiError returns uniform error shape { error: { code, message } }", async () => {
    const res = createApiError(400, "BAD_REQUEST", "Missing required field: url");
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Missing required field: url",
      },
    });
  });

  it("masks 5xx internal server errors in production to prevent information leakage", async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      const res = createApiError(
        500,
        "DATABASE_FAILURE",
        "Connection refused at 10.0.1.42:5432 (internal secret db)"
      );
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error.code).toBe("DATABASE_FAILURE");
      expect(body.error.message).toBe(
        "An unexpected internal server error occurred. Please try again later."
      );
      // Ensure no raw internal DB IP/host leaked
      expect(JSON.stringify(body)).not.toContain("10.0.1.42");
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
    }
  });

  it("handleRouteError returns sanitized 500 response without stack traces in production", async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      const sensitiveError = new Error("Firestore SDK secret token expired: key_live_xyz");
      sensitiveError.stack = "Error: at /server/secret/handler.ts:42\n    at internalFunction";

      const res = handleRouteError(sensitiveError, "INTERNAL_ERROR");
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe(
        "An unexpected internal server error occurred. Please try again later."
      );

      // Verify no stack trace or sensitive error string leaked in response body
      const jsonStr = JSON.stringify(body);
      expect(jsonStr).not.toContain("key_live_xyz");
      expect(jsonStr).not.toContain("stack");
      expect(jsonStr).not.toContain("handler.ts");
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
    }
  });

  it("handleRouteError includes error message in non-production environments for debugging", async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "development";
      const devError = new Error("Zod validation failed: invalid url format");

      const res = handleRouteError(devError, "VALIDATION_FAILED");
      const body = await res.json();

      expect(body.error.code).toBe("VALIDATION_FAILED");
      expect(body.error.message).toContain("Zod validation failed");
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
    }
  });
});
