export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
}

/**
 * Checks if a hostname or IP address represents localhost or a private/reserved network range.
 */
export function isPrivateOrLocalhostHost(host: string): boolean {
  const normalizedHost = host.toLowerCase().trim();

  // Strip IPv6 brackets if present
  const cleanHost = normalizedHost.replace(/^\[|\]$/g, "");

  // Hostname checks
  if (
    cleanHost === "localhost" ||
    cleanHost === "0.0.0.0" ||
    cleanHost === "::1" ||
    cleanHost === "0:0:0:0:0:0:0:1" ||
    cleanHost.endsWith(".local") ||
    cleanHost.endsWith(".internal") ||
    cleanHost.endsWith(".localhost")
  ) {
    return true;
  }

  // IPv4 range checks
  const ipParts = cleanHost.split(".").map(Number);
  if (ipParts.length === 4 && ipParts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    // 127.0.0.0/8 (Loopback)
    if (ipParts[0] === 127) return true;

    // 0.0.0.0/8 (Current network)
    if (ipParts[0] === 0) return true;

    // 10.0.0.0/8 (Private class A)
    if (ipParts[0] === 10) return true;

    // 172.16.0.0/12 (Private class B: 172.16.0.0 - 172.31.255.255)
    if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return true;

    // 192.168.0.0/16 (Private class C)
    if (ipParts[0] === 192 && ipParts[1] === 168) return true;

    // 169.254.0.0/16 (Link-local)
    if (ipParts[0] === 169 && ipParts[1] === 254) return true;
  }

  return false;
}

/**
 * Server-side URL validator for capture requests (FR-2.3).
 * Accepts http/https only, strictly rejects localhost, private IP ranges, and unsafe protocols.
 */
export function validateCaptureUrl(
  rawUrl: string,
  options: { allowSandboxPath?: boolean; appBaseUrl?: string } = {}
): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "Target URL is required." };
  }

  const trimmed = rawUrl.trim();

  // Handle internal sandbox relative routes
  if (trimmed.startsWith("/sandbox/")) {
    if (options.allowSandboxPath) {
      const baseUrl = options.appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const normalized = `${baseUrl.replace(/\/$/, "")}${trimmed}`;
      return { valid: true, normalizedUrl: normalized };
    }
  }

  // Disallow non-HTTP protocols before parsing
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("file:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("ftp:") ||
    lower.startsWith("blob:")
  ) {
    return { valid: false, error: "Only HTTP and HTTPS protocols are permitted." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Invalid URL format." };
  }

  // Protocol check: must be http or https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "URL protocol must be HTTP or HTTPS." };
  }

  // Internal sandbox URLs with explicit host are permitted if pointing to /sandbox/
  if (options.allowSandboxPath && parsed.pathname.startsWith("/sandbox/")) {
    return { valid: true, normalizedUrl: parsed.toString() };
  }

  // Check hostname against localhost and private ranges
  if (isPrivateOrLocalhostHost(parsed.hostname)) {
    return {
      valid: false,
      error: "Capturing localhost, private IP ranges, or internal network addresses is restricted.",
    };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}
