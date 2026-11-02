import { NextRequest, NextResponse } from "next/server";
import { getPublicProof } from "@/lib/firebase/admin";

// Simple in-memory sliding window rate limiter per IP: 60 req/min
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  record.count += 1;
  return true;
}

// Clean up expired entries periodically
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of rateLimitMap.entries()) {
      if (now > rec.resetAt) {
        rateLimitMap.delete(ip);
      }
    }
  }, 5 * 60 * 1000);
  if (timer.unref) timer.unref();
}

export async function GET(
  req: NextRequest,
  { params }: { params: { sha256: string } }
) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const rawSha256 = params.sha256;
    if (!rawSha256) {
      return NextResponse.json({ error: "SHA-256 hash required" }, { status: 400 });
    }

    const cleanHash = (rawSha256.startsWith("0x") ? rawSha256.slice(2) : rawSha256).toLowerCase();

    // Validate 64-hex character hash
    if (!/^[0-9a-f]{64}$/.test(cleanHash)) {
      return NextResponse.json(
        { error: "Invalid SHA-256 format. Expected 64 hexadecimal characters." },
        { status: 400 }
      );
    }

    const proof = await getPublicProof(cleanHash);

    if (!proof) {
      return NextResponse.json({
        found: false,
        message: "Not found in Saakshi's records. This file was not captured by Saakshi, or it has been changed.",
      });
    }

    return NextResponse.json({
      found: true,
      proof,
    });
  } catch (err: unknown) {
    console.error("GET /api/verify/[sha256] error:", err);
    const msg =
      process.env.NODE_ENV === "production"
        ? "Failed to process verification lookup."
        : err instanceof Error
        ? err.message
        : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
