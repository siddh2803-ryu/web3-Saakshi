import { createHash } from "crypto";

/**
 * Computes SHA-256 lowercase hex digest over plaintext bytes or UTF-8 string.
 */
export function computeSha256(data: Buffer | Uint8Array | string): string {
  const hash = createHash("sha256");
  if (typeof data === "string") {
    hash.update(data, "utf8");
  } else {
    hash.update(data);
  }
  return hash.digest("hex").toLowerCase();
}

/**
 * Computes 0x-prefixed bytes32 representation of a SHA-256 hex string.
 */
export function toBytes32(hex: string): `0x${string}` {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return `0x${clean.padStart(64, "0").toLowerCase()}`;
}
