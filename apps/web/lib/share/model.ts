import crypto from "crypto";
import { computeSha256 } from "@/lib/evidence/hash";

export type ShareDuration = "24h" | "7d" | "30d";

export interface ShareRecord {
  id: string; // "sh_" + 32-char hex
  captureId: string;
  ownerUid: string;
  tokenHash: string; // SHA-256 hex of the raw 32-byte secret token
  expiresAt: string; // ISO 8601 string
  includeAi: boolean; // default false
  revoked: boolean;
  revokedAt?: string | null;
  createdAt: string; // ISO 8601 string
}

/**
 * Generates a 32-byte cryptographically secure random token and its SHA-256 hash.
 * Only tokenHash is stored in the database; rawToken is only displayed once to the owner.
 */
export function generateShareToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = computeSha256(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Computes the expiration date from a given duration option.
 * Supported options: 24h, 7d (default), 30d.
 */
export function calculateExpiryDate(
  duration: ShareDuration = "7d",
  now: Date = new Date()
): Date {
  const ms =
    duration === "24h"
      ? 24 * 60 * 60 * 1000
      : duration === "30d"
      ? 30 * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ms);
}

/**
 * Determines whether a share record is valid and unexpired at a given timestamp.
 */
export function isShareActive(
  share: ShareRecord,
  currentTime: Date = new Date()
): boolean {
  if (share.revoked) return false;
  const expiry = new Date(share.expiresAt);
  return expiry.getTime() > currentTime.getTime();
}
