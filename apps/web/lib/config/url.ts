/**
 * Application URL Resolution Helper
 * Resolves the fully-qualified production/preview/local base URL for
 * webhooks, QR codes, verification links, and share URLs.
 *
 * Checks:
 * 1. NEXT_PUBLIC_APP_URL
 * 2. VERCEL_PROJECT_PRODUCTION_URL (Vercel production domain)
 * 3. VERCEL_URL (Vercel deployment URL)
 * 4. Fallback to http://localhost:3000
 *
 * Guarantees https protocol for production hostnames and strips trailing slashes.
 */
export function getAppUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim()) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }

  const vercelProdUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProdUrl && vercelProdUrl.trim()) {
    return `https://${vercelProdUrl.trim().replace(/\/+$/, "")}`;
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl && vercelUrl.trim()) {
    return `https://${vercelUrl.trim().replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
}

/**
 * Constructs the canonical public verification URL for a capture.
 */
export function getVerifyUrl(captureId: string): string {
  return `${getAppUrl()}/v/${encodeURIComponent(captureId)}`;
}

/**
 * Constructs the monitor webhook callback URL.
 */
export function getMonitorWebhookUrl(secretToken?: string): string {
  const token = secretToken || process.env.WEBHOOK_SECRET || "";
  const base = `${getAppUrl()}/api/webhooks/monitor`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

/**
 * Constructs the TinyFish agent callback URL.
 */
export function getTinyFishWebhookUrl(secretToken?: string): string {
  const token = secretToken || process.env.WEBHOOK_SECRET || "";
  const base = `${getAppUrl()}/api/webhooks/tinyfish`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
