import crypto from "crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

// Patterns that identify sensitive tokens, credentials, and keys
const SENSITIVE_KEY_REGEX = /^(?:.*_)?(?:key|secret|token|password|credential|jwt|dek|auth|cookie|private|seed)(?:_.*)?$/i;

// Regex patterns to match strings that look like secrets
const SENSITIVE_STRING_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // JWTs: three base64url segments separated by dots
  {
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: "[REDACTED_JWT]",
  },
  // 32-byte Ethereum/Hex private keys (0x followed by 64 hex chars)
  {
    regex: /0x[a-fA-F0-9]{64}/g,
    replacement: "[REDACTED_HEX_KEY]",
  },
  // Standalone 64-character hex strings (raw 256-bit keys)
  {
    regex: /\b[a-fA-F0-9]{64}\b/g,
    replacement: "[REDACTED_HEX_KEY]",
  },
  // TinyFish API Keys
  {
    regex: /\btf_[A-Za-z0-9_-]{16,}\b/g,
    replacement: "[REDACTED_TINYFISH_KEY]",
  },
  // Bearer Authorization headers / tokens
  {
    regex: /Bearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi,
    replacement: "Bearer [REDACTED_BEARER_TOKEN]",
  },
  // Query parameters containing secret or token
  {
    regex: /([?&](?:token|secret|key|api_key)=)[^&\s"']+/gi,
    replacement: "$1[REDACTED]",
  },
];

/**
 * Deeply redacts secrets from any value (string, object, array).
 * Masks JWTs, private keys, API keys, and sensitive dictionary keys.
 */
export function redactSecrets<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === "string") {
    let result: string = input;
    for (const { regex, replacement } of SENSITIVE_STRING_PATTERNS) {
      result = result.replace(regex, replacement);
    }
    return result as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSecrets(item)) as unknown as T;
  }

  if (typeof input === "object" && !(input instanceof Date) && !(input instanceof RegExp)) {
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactSecrets(val);
      }
    }
    return output as unknown as T;
  }

  return input;
}

/**
 * Extracts a request ID from standard request headers or generates a new one.
 */
export function extractRequestId(
  req?: Request | { headers: Headers | Record<string, string | null | undefined> }
): string {
  if (req && "headers" in req) {
    let headerVal: string | null | undefined = null;
    if (typeof (req.headers as Headers).get === "function") {
      headerVal =
        (req.headers as Headers).get("x-request-id") ||
        (req.headers as Headers).get("x-correlation-id");
    } else {
      const h = req.headers as Record<string, string | null | undefined>;
      headerVal = h["x-request-id"] || h["X-Request-Id"] || h["x-correlation-id"];
    }
    if (headerVal && headerVal.trim()) {
      return headerVal.trim();
    }
  }
  return `req_${crypto.randomBytes(8).toString("hex")}`;
}

export class StructuredLogger {
  private boundRequestId?: string;

  constructor(requestId?: string) {
    this.boundRequestId = requestId;
  }

  /**
   * Returns a child logger bound to a specific request ID.
   */
  withRequestId(requestId: string): StructuredLogger {
    return new StructuredLogger(requestId);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: redactSecrets(message),
      ...(this.boundRequestId ? { requestId: this.boundRequestId } : {}),
      ...(context ? redactSecrets(context) : {}),
    };

    const serialized = JSON.stringify(entry);

    switch (level) {
      case "error":
        console.error(serialized);
        break;
      case "warn":
        console.warn(serialized);
        break;
      case "debug":
        if (process.env.NODE_ENV !== "production") {
          console.debug(serialized);
        }
        break;
      case "info":
      default:
        console.log(serialized);
        break;
    }

    return entry;
  }

  info(message: string, context?: Record<string, unknown>): LogEntry {
    return this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): LogEntry {
    return this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): LogEntry {
    return this.log("error", message, context);
  }

  debug(message: string, context?: Record<string, unknown>): LogEntry {
    return this.log("debug", message, context);
  }
}

export const logger = new StructuredLogger();
