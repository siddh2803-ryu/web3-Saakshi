import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  StructuredLogger,
  logger,
  redactSecrets,
  extractRequestId,
} from "@/lib/logging/logger";

describe("Phase 9: Structured Logging with Request IDs & Secret Redaction (PRD Section 17)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Secret Redaction Engine", () => {
    it("redacts JSON Web Tokens (JWT) from messages and context", () => {
      const sampleJwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      const message = `User authenticated with JWT: ${sampleJwt}`;
      const redacted = redactSecrets(message);

      expect(redacted).not.toContain(sampleJwt);
      expect(redacted).toContain("[REDACTED_JWT]");
    });

    it("redacts Ethereum and hex private keys (0x followed by 64 hex characters)", () => {
      const samplePrivKey = "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";
      const message = `Signing transaction with key: ${samplePrivKey}`;
      const redacted = redactSecrets(message);

      expect(redacted).not.toContain(samplePrivKey);
      expect(redacted).toContain("[REDACTED_HEX_KEY]");
    });

    it("redacts TinyFish API keys (tf_...)", () => {
      const sampleTinyKey = "tf_live_9876543210abcdef9876";
      const message = `Sending TinyFish request with api_key: ${sampleTinyKey}`;
      const redacted = redactSecrets(message);

      expect(redacted).not.toContain(sampleTinyKey);
      expect(redacted).toContain("[REDACTED_TINYFISH_KEY]");
    });

    it("redacts Bearer Authorization headers and tokens", () => {
      const authHeader = "Bearer secret_session_token_1234567890abcdef";
      const redacted = redactSecrets(authHeader);

      expect(redacted).not.toContain("secret_session_token_1234567890abcdef");
      expect(redacted).toContain("Bearer [REDACTED_BEARER_TOKEN]");
    });

    it("redacts query string secrets like ?token=... or ?secret=...", () => {
      const url = "https://example.com/api/webhooks?token=super_secret_webhook_pass&captureId=cap_1";
      const redacted = redactSecrets(url);

      expect(redacted).not.toContain("super_secret_webhook_pass");
      expect(redacted).toContain("?token=[REDACTED]");
      expect(redacted).toContain("&captureId=cap_1");
    });

    it("redacts sensitive object keys (password, secretKey, masterKey, token, privateKey)", () => {
      const obj = {
        captureId: "cap_123",
        user_email: "test@example.com",
        master_key_b64: "aGVsbG8gd29ybGQ=",
        api_secret: "shhh_secret_val",
        auth_token: "tok_xyz987",
        nested: {
          private_key: "0x123",
          safeProperty: "visible",
        },
      };

      const redacted = redactSecrets(obj) as any;
      expect(redacted.captureId).toBe("cap_123");
      expect(redacted.user_email).toBe("test@example.com");
      expect(redacted.master_key_b64).toBe("[REDACTED]");
      expect(redacted.api_secret).toBe("[REDACTED]");
      expect(redacted.auth_token).toBe("[REDACTED]");
      expect(redacted.nested.private_key).toBe("[REDACTED]");
      expect(redacted.nested.safeProperty).toBe("visible");
    });

    it("preserves non-sensitive strings, timestamps, hashes and numbers", () => {
      const safeData = {
        captureId: "cap_888",
        status: "READY",
        manifestSha256: "0123456789abcdef",
        durationMs: 1420,
        active: true,
      };

      expect(redactSecrets(safeData)).toEqual(safeData);
    });
  });

  describe("Request ID Extraction & Correlation", () => {
    it("extracts x-request-id from Request Headers object", () => {
      const req = new Request("http://localhost:3000/api/captures", {
        headers: { "x-request-id": "req-client-assigned-001" },
      });
      expect(extractRequestId(req)).toBe("req-client-assigned-001");
    });

    it("generates a new unique request ID if header is absent", () => {
      const req = new Request("http://localhost:3000/api/captures");
      const generated = extractRequestId(req);
      expect(generated).toMatch(/^req_[a-f0-9]{16}$/);
    });
  });

  describe("Structured JSON Output", () => {
    it("emits structured JSON logs containing timestamp, level, message, and requestId", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const reqLogger = logger.withRequestId("req_test_123");

      const entry = reqLogger.info("Starting pipeline execution", { captureId: "cap_100" });

      expect(entry.level).toBe("info");
      expect(entry.message).toBe("Starting pipeline execution");
      expect(entry.requestId).toBe("req_test_123");
      expect(entry.captureId).toBe("cap_100");
      expect(entry.timestamp).toBeTruthy();

      expect(consoleSpy).toHaveBeenCalledOnce();
      const loggedJson = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedJson.requestId).toBe("req_test_123");
      expect(loggedJson.message).toBe("Starting pipeline execution");
    });

    it("automatically redacts secrets logged via logger.error", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const secretToken = "0x1111222233334444555566667777888899990000111122223333444455556666";

      logger.error(`Critical transaction failed with key ${secretToken}`, {
        secret_payload: "hidden_value",
      });

      expect(errorSpy).toHaveBeenCalledOnce();
      const logged = errorSpy.mock.calls[0][0];
      expect(logged).not.toContain(secretToken);
      expect(logged).toContain("[REDACTED_HEX_KEY]");
      expect(logged).toContain('"[REDACTED]"');
    });
  });
});
