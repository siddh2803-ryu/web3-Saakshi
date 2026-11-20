import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";

export interface RateLimitOptions {
  action: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter: number;
}

// In-memory fallback map for environments without Firestore or local tests
const memoryRateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Extracts client IP from standard Next.js request headers.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "127.0.0.1";
}

/**
 * Shared rate limiter using Firestore counters (with in-memory fallback).
 * Uses atomic Firestore transactions across serverless instances.
 * Returns { allowed, remaining, resetAt, retryAfter }.
 */
export async function checkSharedRateLimit({
  action,
  identifier,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const cleanId = (identifier || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  const docKey = `${action}_${cleanId}`;

  const fs = getAdminFirestore();
  if (fs) {
    try {
      const docRef = fs.collection("rate_limits").doc(docKey);
      return await fs.runTransaction(async (t) => {
        const snap = await t.get(docRef);
        if (!snap.exists) {
          const resetAt = now + windowMs;
          t.set(docRef, { count: 1, resetAt, updatedAt: new Date().toISOString() });
          return {
            allowed: true,
            remaining: limit - 1,
            resetAt,
            retryAfter: 0,
          };
        }

        const data = snap.data() as { count: number; resetAt: number };
        if (!data.resetAt || now > data.resetAt) {
          const resetAt = now + windowMs;
          t.set(docRef, { count: 1, resetAt, updatedAt: new Date().toISOString() });
          return {
            allowed: true,
            remaining: limit - 1,
            resetAt,
            retryAfter: 0,
          };
        }

        if (data.count >= limit) {
          const retryAfter = Math.max(1, Math.ceil((data.resetAt - now) / 1000));
          return {
            allowed: false,
            remaining: 0,
            resetAt: data.resetAt,
            retryAfter,
          };
        }

        const newCount = (data.count || 0) + 1;
        t.update(docRef, { count: newCount, updatedAt: new Date().toISOString() });
        return {
          allowed: true,
          remaining: limit - newCount,
          resetAt: data.resetAt,
          retryAfter: 0,
        };
      });
    } catch (err) {
      console.warn("Firestore rate limit transaction failed, falling back to memory store:", err);
    }
  }

  // Memory store fallback
  const record = memoryRateLimitMap.get(docKey);
  if (!record || now > record.resetAt) {
    const resetAt = now + windowMs;
    memoryRateLimitMap.set(docKey, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt,
      retryAfter: 0,
    };
  }

  if (record.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
      retryAfter,
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: limit - record.count,
    resetAt: record.resetAt,
    retryAfter: 0,
  };
}

/**
 * Creates standard HTTP 429 response with Retry-After header.
 */
export function rateLimitExceededResponse(retryAfterSeconds: number = 60): NextResponse {
  return NextResponse.json(
    {
      error: "Too many requests. Please try again later.",
      code: "RATE_LIMITED",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}

/**
 * Resets memory rate limits for testing.
 */
export function resetRateLimitsForTesting(): void {
  memoryRateLimitMap.clear();
}
