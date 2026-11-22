import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAppUrl,
  getVerifyUrl,
  getMonitorWebhookUrl,
  getTinyFishWebhookUrl,
} from "@/lib/config/url";

describe("Application URL Resolution (Webhooks, QR Codes & Links)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    delete process.env.WEBHOOK_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to http://localhost:3000 when no environment variables are present", () => {
    expect(getAppUrl()).toBe("http://localhost:3000");
    expect(getVerifyUrl("cap_123")).toBe("http://localhost:3000/v/cap_123");
    expect(getMonitorWebhookUrl()).toBe("http://localhost:3000/api/webhooks/monitor");
    expect(getTinyFishWebhookUrl()).toBe("http://localhost:3000/api/webhooks/tinyfish");
  });

  it("prioritizes NEXT_PUBLIC_APP_URL and ensures https if protocol is missing", () => {
    process.env.NEXT_PUBLIC_APP_URL = "saakshi.app/";
    expect(getAppUrl()).toBe("https://saakshi.app");
    expect(getVerifyUrl("cap_abc")).toBe("https://saakshi.app/v/cap_abc");
  });

  it("preserves explicit http scheme in development when specified in NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000/";
    expect(getAppUrl()).toBe("http://127.0.0.1:3000");
  });

  it("uses VERCEL_PROJECT_PRODUCTION_URL when NEXT_PUBLIC_APP_URL is not set", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "saakshi-evidence.vercel.app";
    expect(getAppUrl()).toBe("https://saakshi-evidence.vercel.app");
  });

  it("uses VERCEL_URL as deployment fallback when primary production URL is unset", () => {
    process.env.VERCEL_URL = "saakshi-git-branch-team.vercel.app";
    expect(getAppUrl()).toBe("https://saakshi-git-branch-team.vercel.app");
  });

  it("appends authenticated token parameter to webhook URLs", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://saakshi.app";
    process.env.WEBHOOK_SECRET = "sec_test_secret_9988";
    expect(getMonitorWebhookUrl()).toBe(
      "https://saakshi.app/api/webhooks/monitor?token=sec_test_secret_9988"
    );
    expect(getTinyFishWebhookUrl()).toBe(
      "https://saakshi.app/api/webhooks/tinyfish?token=sec_test_secret_9988"
    );
  });
});
