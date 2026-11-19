import crypto from "crypto";
import { canonicalJson } from "@/lib/evidence/canonical";
import { computeSha256 } from "@/lib/evidence/hash";

export type CustodyAction = "CREATE" | "VIEW" | "EXPORT" | "SHARE" | "VERIFY";

export interface CustodyEvent {
  id: string; // "cust_" + 32-char hex
  captureId: string;
  action: CustodyAction;
  actorHash: string; // Salted hash of uid, or "share:" + shareId
  at: string; // ISO 8601 timestamp
  prevEventHash: string | null;
  eventHash: string; // SHA-256(JCS({ captureId, action, actorHash, at, prevEventHash }))
  txHash: string | null;
  details?: Record<string, unknown>;
}

/**
 * Computes a salted hash for the actor identity.
 * For owners: SHA-256(salt + ":" + uid). Never stores raw emails or IP addresses.
 * For share link recipients: "share:" + shareId.
 */
export function computeActorHash(actorId: string, isShare: boolean = false): string {
  if (!actorId) return "anonymous";
  if (isShare || actorId.startsWith("share:")) {
    const cleanId = actorId.replace(/^share:/, "");
    return `share:${cleanId}`;
  }
  const salt = process.env.UID_HASH_SALT || "saakshi_custody_actor_salt_v1";
  return computeSha256(`${salt}:${actorId}`);
}

/**
 * Computes RFC 8785 canonical JSON hash for a custody event in the hash chain:
 * eventHash = SHA-256(JCS({ captureId, action, actorHash, at, prevEventHash }))
 */
export function computeEventHash(params: {
  captureId: string;
  action: CustodyAction;
  actorHash: string;
  at: string;
  prevEventHash: string | null;
}): string {
  const payload = {
    action: params.action,
    actorHash: params.actorHash,
    at: params.at,
    captureId: params.captureId,
    prevEventHash: params.prevEventHash,
  };
  const canonical = canonicalJson(payload);
  return computeSha256(canonical);
}

/**
 * Builds a new custody event linking to the previous event hash.
 */
export function buildCustodyEvent(params: {
  captureId: string;
  action: CustodyAction;
  actorId: string;
  isShare?: boolean;
  prevEventHash: string | null;
  at?: string;
  txHash?: string | null;
  details?: Record<string, unknown>;
}): CustodyEvent {
  const at = params.at || new Date().toISOString();
  const actorHash = computeActorHash(params.actorId, params.isShare);
  const eventHash = computeEventHash({
    captureId: params.captureId,
    action: params.action,
    actorHash,
    at,
    prevEventHash: params.prevEventHash,
  });

  const id = `cust_${crypto.randomBytes(16).toString("hex")}`;
  return {
    id,
    captureId: params.captureId,
    action: params.action,
    actorHash,
    at,
    prevEventHash: params.prevEventHash,
    eventHash,
    txHash: params.txHash || null,
    details: params.details,
  };
}

export interface CustodyVerificationResult {
  valid: boolean;
  totalEvents: number;
  brokenAtIndex?: number;
  brokenEventId?: string;
  reason?: string;
}

/**
 * Cryptographically verifies an entire custody event chain for a capture.
 * Verifies that:
 * 1. Genesis event (index 0) has prevEventHash === null.
 * 2. Every subsequent event has prevEventHash matching the preceding event's eventHash.
 * 3. Every event's stored eventHash exactly equals computeEventHash({ captureId, action, actorHash, at, prevEventHash }).
 * Any editing, reordering, or deletion of past events breaks the chain.
 */
export function verifyCustodyChain(events: CustodyEvent[]): CustodyVerificationResult {
  if (!events || events.length === 0) {
    return { valid: true, totalEvents: 0 };
  }

  for (let i = 0; i < events.length; i++) {
    const current = events[i];
    const expectedPrev = i === 0 ? null : events[i - 1].eventHash;

    if (current.prevEventHash !== expectedPrev) {
      return {
        valid: false,
        totalEvents: events.length,
        brokenAtIndex: i,
        brokenEventId: current.id,
        reason: `Broken chain link at event ${current.id} (index ${i}): expected prevEventHash "${expectedPrev}", but found "${current.prevEventHash}".`,
      };
    }

    const calculatedHash = computeEventHash({
      captureId: current.captureId,
      action: current.action,
      actorHash: current.actorHash,
      at: current.at,
      prevEventHash: current.prevEventHash,
    });

    if (current.eventHash !== calculatedHash) {
      return {
        valid: false,
        totalEvents: events.length,
        brokenAtIndex: i,
        brokenEventId: current.id,
        reason: `Hash mismatch at event ${current.id} (index ${i}): stored eventHash "${current.eventHash}", but recomputed "${calculatedHash}".`,
      };
    }
  }

  return { valid: true, totalEvents: events.length };
}
