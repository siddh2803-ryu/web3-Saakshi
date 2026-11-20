import { describe, it, expect } from "vitest";
import {
  EnvSchema,
  ProductionEnvSchema,
  validateEnvironment,
} from "@/lib/config/env";

describe("Phase 9: Environment Variable Validation (PRD Section 16)", () => {
  const validProdEnv = {
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://saakshi.app",
    WEBHOOK_SECRET: "strong_production_webhook_secret_998811",
    MASTER_KEY_B64: Buffer.alloc(32, 1).toString("base64"),
    UID_HASH_SALT: "strong_production_salt_12345678",
    TINYFISH_API_KEY: "tf_live_secret_key",
    PINATA_JWT: "pinata_jwt_token_prod",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "saakshi-prod",
    AMOY_RPC_URL: "https://rpc-amoy.polygon.technology",
    GEMINI_MODEL: "gemini-2.5-flash",
    CAPTURE_ENABLED: "true" as const,
    DAILY_FREE_CAPTURES: "5",
  };

  it("passes validation for a fully populated production environment", () => {
    const res = validateEnvironment(validProdEnv, { isProduction: true });
    expect(res.success).toBe(true);
    expect(res.missingNames).toHaveLength(0);
    expect(res.data?.GEMINI_MODEL).toBe("gemini-2.5-flash");
  });

  it("fails when production required variables are missing, listing variable NAMES only", () => {
    const incompleteEnv = {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://saakshi.app",
      // missing: WEBHOOK_SECRET, MASTER_KEY_B64, UID_HASH_SALT, TINYFISH_API_KEY, PINATA_JWT
    };

    const res = validateEnvironment(incompleteEnv, { isProduction: true });
    expect(res.success).toBe(false);
    expect(res.missingNames).toContain("WEBHOOK_SECRET");
    expect(res.missingNames).toContain("MASTER_KEY_B64");
    expect(res.missingNames).toContain("TINYFISH_API_KEY");
    expect(res.missingNames).toContain("PINATA_JWT");

    // Strictly ensure error message contains NAMES only, never values
    expect(res.errorMessage).toContain("WEBHOOK_SECRET");
    expect(res.errorMessage).not.toContain("tf_live");
  });

  it("rejects MASTER_KEY_B64 if it does not decode to exactly 32 bytes", () => {
    const invalidKeyEnv = {
      ...validProdEnv,
      MASTER_KEY_B64: Buffer.alloc(16, 1).toString("base64"), // 16 bytes instead of 32
    };

    const res = validateEnvironment(invalidKeyEnv, { isProduction: true });
    expect(res.success).toBe(false);
    expect(res.missingNames).toContain("MASTER_KEY_B64");
  });

  it("throws Error with missing variable names when throwOnError is true", () => {
    expect(() => {
      validateEnvironment({}, { isProduction: true, throwOnError: true });
    }).toThrowError(/Missing or invalid variable\(s\):/);
  });

  it("allows minimal environment in development mode", () => {
    const devEnv = {
      NODE_ENV: "development",
      TINYFISH_MODE: "fixture",
    };

    const res = validateEnvironment(devEnv, { isProduction: false });
    expect(res.success).toBe(true);
  });
});
