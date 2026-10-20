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
 * Retrieves the 256-bit Master Key from environment.
 * Throws if not configured or invalid length.
 */
export function getMasterKey(): Buffer {
  const b64 = process.env.MASTER_KEY_B64;
  if (!b64) {
    throw new Error("MASTER_KEY_B64 is not configured in environment");
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) {
    throw new Error(`MASTER_KEY_B64 must be exactly 32 bytes (got ${buf.length} bytes)`);
  }
  return buf;
}

/**
 * Generates a cryptographically random 256-bit Data Encryption Key (DEK).
 */
export function generateDek(): Buffer {
  return randomBytes(32);
}

/**
 * Encrypts data using AES-256-GCM with a 96-bit (12-byte) IV.
 */
export function encryptWithKey(plaintext: Buffer, key: Buffer): EncryptedPayload {
  if (key.length !== 32) {
    throw new Error("AES-256 key must be 32 bytes");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    ivHex: iv.toString("hex"),
    authTagHex: authTag.toString("hex"),
  };
}

/**
 * Decrypts data using AES-256-GCM with authentication tag check.
 * Throws on tampering or authentication tag mismatch.
 */
export function decryptWithKey(
  ciphertext: Buffer,
  key: Buffer,
  ivHex: string,
  authTagHex: string
): Buffer {
  if (key.length !== 32) {
    throw new Error("AES-256 key must be 32 bytes");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Wraps a DEK using the Master Key via AES-256-GCM.
 */
export function wrapDek(dek: Buffer, masterKey: Buffer = getMasterKey()): WrappedKey {
  const enc = encryptWithKey(dek, masterKey);
  return {
    wrappedKeyHex: enc.ciphertext.toString("hex"),
    ivHex: enc.ivHex,
    authTagHex: enc.authTagHex,
  };
}

/**
 * Unwraps a wrapped DEK using the Master Key.
 */
export function unwrapDek(wrappedKey: WrappedKey, masterKey: Buffer = getMasterKey()): Buffer {
  const ciphertext = Buffer.from(wrappedKey.wrappedKeyHex, "hex");
  return decryptWithKey(ciphertext, masterKey, wrappedKey.ivHex, wrappedKey.authTagHex);
}
