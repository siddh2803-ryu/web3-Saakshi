/**
 * Normalizes text content for stable cryptographic comparison:
 * 1. Unicode NFC normalization.
 * 2. Unifies newline sequences (\r\n -> \n).
 * 3. Strips transient trailing whitespace and collapses excessive internal blank lines.
 * 4. Trims leading and trailing whitespace.
 */
export function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
