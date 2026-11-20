export interface ProductionGuardViolation {
  key: string;
  forbiddenValue: string;
}

export const DEV_ONLY_FLAGS: readonly ProductionGuardViolation[] = [
  { key: "TINYFISH_MODE", forbiddenValue: "fixture" },
  { key: "IPFS_FALLBACK", forbiddenValue: "dev" },
  { key: "CHAIN_MODE", forbiddenValue: "mock" },
  { key: "AI_FALLBACK", forbiddenValue: "dev" },
] as const;

export interface ProductionGuardResult {
  allowed: boolean;
  violations: string[];
}

/**
 * Checks whether any dev-only flag is set in production.
 * Flags: TINYFISH_MODE=fixture, IPFS_FALLBACK=dev, CHAIN_MODE=mock, AI_FALLBACK=dev.
 */
export function checkProductionGuards(
  env: Record<string, string | undefined> = process.env
): ProductionGuardResult {
  const isProd = env.NODE_ENV === "production";
  if (!isProd) {
    return { allowed: true, violations: [] };
  }

  const violations: string[] = [];
  for (const { key, forbiddenValue } of DEV_ONLY_FLAGS) {
    if (env[key] === forbiddenValue) {
      violations.push(`${key}=${forbiddenValue}`);
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

/**
 * Throws a fatal Error if any dev-only flag is active in production.
 */
export function assertProductionGuards(
  env: Record<string, string | undefined> = process.env
): void {
  const result = checkProductionGuards(env);
  if (!result.allowed) {
    throw new Error(
      `[Production Guard Failure] Production build rejected: dev-only fallback flag(s) active: ${result.violations.join(
        ", "
      )}. Disable these flags before building for production.`
    );
  }
}
