/**
 * Rate Limiter for Public Share Views & Endpoints (/s/[token] and /api/shares/[token]/*)
 * Implements sliding-window per-IP rate limiting to prevent enumeration attacks.
 */

const shareRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const SHARE_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const SHARE_MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per minute

export function checkShareRateLimit(ip: string): boolean {
  const cleanIp = ip ? ip.trim() : "127.0.0.1";
  const now = Date.now();
  const record = shareRateLimitMap.get(cleanIp);

  if (!record || now > record.resetAt) {
    shareRateLimitMap.set(cleanIp, { count: 1, resetAt: now + SHARE_RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= SHARE_MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  record.count += 1;
  return true;
}

export function resetShareRateLimit(): void {
  shareRateLimitMap.clear();
}
