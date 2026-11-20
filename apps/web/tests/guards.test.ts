import { describe, it, expect } from "vitest";
import {
  checkProductionGuards,
  assertProductionGuards,
  DEV_ONLY_FLAGS,
} from "@/lib/config/guards";

describe("Phase 9: Production Build Guards (PRD Section 7.8, 17)", () => {
  it("allows builds when NODE_ENV is development or test regardless of flags", () => {
    const devEnv = {
      NODE_ENV: "development",
      TINYFISH_MODE: "fixture",
      IPFS_FALLBACK: "dev",
      CHAIN_MODE: "mock",
      AI_FALLBACK: "dev",
    };

    const res = checkProductionGuards(devEnv);
    expect(res.allowed).toBe(true);
    expect(res.violations).toHaveLength(0);
    expect(() => assertProductionGuards(devEnv)).not.toThrow();
  });

  it("allows clean production environment with no dev-only flags", () => {
    const cleanProdEnv = {
      NODE_ENV: "production",
      TINYFISH_MODE: "live",
      GEMINI_MODEL: "gemini-2.5-flash",
    };

    const res = checkProductionGuards(cleanProdEnv);
    expect(res.allowed).toBe(true);
    expect(res.violations).toHaveLength(0);
    expect(() => assertProductionGuards(cleanProdEnv)).not.toThrow();
  });

  // Test that runs the guard with EACH individual flag
  DEV_ONLY_FLAGS.forEach(({ key, forbiddenValue }) => {
    it(`fails production build when ${key}=${forbiddenValue} is set`, () => {
      const prodEnvWithFlag = {
        NODE_ENV: "production",
        TINYFISH_MODE: "live",
        [key]: forbiddenValue,
      };

      const res = checkProductionGuards(prodEnvWithFlag);
      expect(res.allowed).toBe(false);
      expect(res.violations).toContain(`${key}=${forbiddenValue}`);

      expect(() => assertProductionGuards(prodEnvWithFlag)).toThrowError(
        new RegExp(`\\[Production Guard Failure\\].*${key}=${forbiddenValue}`)
      );
    });
  });

  it("fails production build and lists all violations when multiple dev flags are set", () => {
    const multiFlagEnv = {
      NODE_ENV: "production",
      TINYFISH_MODE: "fixture",
      IPFS_FALLBACK: "dev",
      CHAIN_MODE: "mock",
      AI_FALLBACK: "dev",
    };

    const res = checkProductionGuards(multiFlagEnv);
    expect(res.allowed).toBe(false);
    expect(res.violations).toEqual([
      "TINYFISH_MODE=fixture",
      "IPFS_FALLBACK=dev",
      "CHAIN_MODE=mock",
      "AI_FALLBACK=dev",
    ]);

    expect(() => assertProductionGuards(multiFlagEnv)).toThrowError(
      /TINYFISH_MODE=fixture.*IPFS_FALLBACK=dev.*CHAIN_MODE=mock.*AI_FALLBACK=dev/
    );
  });
});
