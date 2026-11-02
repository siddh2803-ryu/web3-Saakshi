import { canonicalJson } from "./canonical";

/**
 * Computes SHA-256 lowercase hex digest using W3C WebCrypto API (SubtleCrypto).
 * Works identically in standard browsers and modern Node.js environments.
 */
export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof data === "string") {
    buffer = new TextEncoder().encode(data).buffer as ArrayBuffer;
  } else if (data instanceof Uint8Array) {
    buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  } else {
    buffer = data;
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto SubtleCrypto is not available in the current runtime environment");
  }

  const digestBuffer = await subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(digestBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toLowerCase();
}

/**
 * Recomputes the canonical RFC 8785 JSON manifest SHA-256 digest.
 * Shared module between browser and Node environments.
 */
export async function computeCanonicalManifestHash(manifest: unknown): Promise<{
  canonical: string;
  manifestSha256: string;
}> {
  const canonical = canonicalJson(manifest);
  const manifestSha256 = await sha256Hex(canonical);
  return { canonical, manifestSha256 };
}
