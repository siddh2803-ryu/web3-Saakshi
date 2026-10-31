import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export interface EncryptedPayload {
  ciphertext: Buffer;
  ivHex: string;
  authTagHex: string;
}

export interface WrappedKey {
  wrappedKeyHex: string;
  ivHex: string;
  authTagHex: string;
}

/**
 * Validates that MASTER_KEY_B64 decodes to exactly 32 bytes.
 * Throws a clear error if missing or invalid length.
 */
export function validateMasterKey(b64: string = process.env.MASTER_KEY_B64 || ""): Buffer {
  if (!b64 || b64.trim() === "") {
    throw new Error("MASTER_KEY_B64 is not configured in environment");
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) {
    throw new Error(`MASTER_KEY_B64 must decode to exactly 32 bytes (got ${buf.length} bytes)`);
  }
  return buf;
}

// Module-level startup check if MASTER_KEY_B64 is set in environment
if (process.env.MASTER_KEY_B64) {
  try {
    validateMasterKey(process.env.MASTER_KEY_B64);
  } catch (err) {
    console.error("Startup configuration error: invalid MASTER_KEY_B64:", err);
  }
}

/**
 * Retrieves the validated 256-bit Master Key from environment.
 * Refuses execution if not configured or invalid length.
 */
export function getMasterKey(): Buffer {
  return validateMasterKey(process.env.MASTER_KEY_B64 || "");
}

/**
 * Generates a cryptographically random 256-bit Data Encryption Key (DEK).
 */
export function generateDek(): Buffer {
  return randomBytes(32);
}

/**
 * Encrypts data using AES-256-GCM with a fresh random 96-bit (12-byte) IV.
 * Optionally binds ciphertext with Additional Authenticated Data (AAD) = `${captureId}:${artifactId}`.
 */
export function encryptWithKey(
  plaintext: Buffer,
  key: Buffer,
  aad?: string
): EncryptedPayload {
  if (key.length !== 32) {
    throw new Error("AES-256 key must be 32 bytes");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(aad, "utf8"));
  }
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    ivHex: iv.toString("hex"),
    authTagHex: authTag.toString("hex"),
  };
}

/**
 * Decrypts data using AES-256-GCM with authentication tag check and optional AAD.
 * Throws on tampering, authentication tag mismatch, or wrong AAD.
 */
export function decryptWithKey(
  ciphertext: Buffer,
  key: Buffer,
  ivHex: string,
  authTagHex: string,
  aad?: string
): Buffer {
  if (key.length !== 32) {
    throw new Error("AES-256 key must be 32 bytes");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  if (aad) {
    decipher.setAAD(Buffer.from(aad, "utf8"));
  }
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Wraps a DEK using the Master Key via AES-256-GCM.
 */
export function wrapDek(
  dek: Buffer,
  masterKey: Buffer = getMasterKey(),
  aad?: string
): WrappedKey {
  const enc = encryptWithKey(dek, masterKey, aad);
  return {
    wrappedKeyHex: enc.ciphertext.toString("hex"),
    ivHex: enc.ivHex,
    authTagHex: enc.authTagHex,
  };
}

/**
 * Unwraps a wrapped DEK using the Master Key.
 */
export function unwrapDek(
  wrappedKey: WrappedKey,
  masterKey: Buffer = getMasterKey(),
  aad?: string
): Buffer {
  const ciphertext = Buffer.from(wrappedKey.wrappedKeyHex, "hex");
  return decryptWithKey(ciphertext, masterKey, wrappedKey.ivHex, wrappedKey.authTagHex, aad);
}
