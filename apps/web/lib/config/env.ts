import { z } from "zod";

/**
 * Comprehensive Zod schema for all Saakshi environment variables (PRD Section 16).
 * Validated at server startup. On failure, reports missing variable NAMES only, never values.
 */
export const EnvSchema = z.object({
  // App
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  SANDBOX_ADMIN_SECRET: z.string().optional(),
  CAPTURE_ENABLED: z.enum(["true", "false"]).default("true"),
  DAILY_FREE_CAPTURES: z.string().default("5"),

  // TinyFish
  TINYFISH_API_KEY: z.string().optional(),
  TINYFISH_MODE: z.enum(["live", "fixture"]).default("live"),
  TINYFISH_AGENT_BETA: z.enum(["true", "false"]).default("false"),
  TINYFISH_CAPTURE_CONFIG: z.enum(["true", "false"]).default("false"),

  // Firebase
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().default("saakshi-demo"),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_B64: z.string().optional(),

  // Evidence crypto
  MASTER_KEY_B64: z
    .string()
    .refine(
      (val) => {
        if (!val) return true;
        try {
          return Buffer.from(val, "base64").length === 32;
        } catch {
          return false;
        }
      },
      { message: "MASTER_KEY_B64 must decode to exactly 32 bytes" }
    )
    .optional(),
  UID_HASH_SALT: z.string().optional(),

  // IPFS
  PINATA_JWT: z.string().optional(),
  PINATA_GATEWAY: z.string().optional(),
  IPFS_FALLBACK: z.enum(["dev"]).optional(),

  // Chain
  AMOY_RPC_URL: z.string().optional(),
  ANCHOR_PRIVATE_KEY: z.string().optional(),
  NEXT_PUBLIC_REGISTRY_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_CHAIN_ID: z.string().optional(),
  NEXT_PUBLIC_AMOY_RPC_URL: z.string().optional(),
  NEXT_PUBLIC_EXPLORER_URL: z.string().optional(),
  POLYGONSCAN_API_KEY: z.string().optional(),

  // AI
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  AI_FALLBACK: z.enum(["dev"]).optional(),

  // Dev flags
  CHAIN_MODE: z.enum(["mock", "local", "amoy"]).optional(),

  // Optional
  RESEND_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type ValidatedEnv = z.infer<typeof EnvSchema>;

/**
 * Strict production environment schema:
 * Required secrets must be present in production.
 */
export const ProductionEnvSchema = EnvSchema.extend({
  WEBHOOK_SECRET: z.string().min(8),
  MASTER_KEY_B64: z.string().refine(
    (val) => {
      try {
        return Buffer.from(val, "base64").length === 32;
      } catch {
        return false;
      }
    },
    { message: "MASTER_KEY_B64 must decode to exactly 32 bytes" }
  ),
  UID_HASH_SALT: z.string().min(8),
  TINYFISH_API_KEY: z.string().min(1),
  PINATA_JWT: z.string().min(1),
  AMOY_RPC_URL: z.string().min(1),
});

/**
 * Validates environment variables.
 * On failure, returns or throws missing variable NAMES only, never values.
 */
export function validateEnvironment(
  rawEnv: Record<string, string | undefined> = process.env,
  options: { isProduction?: boolean; throwOnError?: boolean } = {}
): {
  success: boolean;
  missingNames: string[];
  errorMessage?: string;
  data?: ValidatedEnv;
} {
  const isProd =
    options.isProduction ?? (rawEnv.NODE_ENV === "production");

  const schema = isProd ? ProductionEnvSchema : EnvSchema;
  const result = schema.safeParse(rawEnv);

  if (!result.success) {
    // Extract unique variable NAMES only - NEVER expose values!
    const missingNames = Array.from(
      new Set(
        result.error.issues.map((issue) => {
          const path = issue.path[0];
          return typeof path === "string" ? path : String(path);
        })
      )
    ).filter(Boolean);

    const errorMessage = `Environment validation failed. Missing or invalid variable(s): ${missingNames.join(
      ", "
    )}`;

    if (options.throwOnError) {
      throw new Error(errorMessage);
    }

    return {
      success: false,
      missingNames,
      errorMessage,
    };
  }

  return {
    success: true,
    missingNames: [],
    data: result.data,
  };
}

/**
 * Server startup check. Run on server initialization.
 * Logs only missing variable names if validation fails.
 */
export function checkServerEnvironment(): void {
  const isProd = process.env.NODE_ENV === "production";
  const result = validateEnvironment(process.env, {
    isProduction: isProd,
    throwOnError: isProd,
  });

  if (!result.success) {
    // Never print values, print names only
    console.error(
      `[Startup Environment Validation Warning] Missing or invalid variable names: ${result.missingNames.join(
        ", "
      )}`
    );
  }
}
