import canonicalize from "canonicalize";

/**
 * Deterministically serializes a JavaScript object into RFC 8785 JSON Canonicalization Scheme (JCS) format.
 */
export function canonicalJson(obj: unknown): string {
  const serialized = canonicalize(obj);
  if (typeof serialized !== "string") {
    throw new Error("Failed to canonicalize object to RFC 8785 JSON: invalid structure");
  }
  return serialized;
}
