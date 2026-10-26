import { describe, it, expect } from "vitest";
import { classifyWatchCheck } from "../lib/watch/classify";
import { computeSha256 } from "../lib/evidence/hash";
import { normalizeText } from "../lib/evidence/normalize";

describe("Watch Classifier & Diff Rules", () => {
  const baselineText = `# Internship Scam Alert
CareerBridge Global posted:
Mandatory fee of Rs 2,499 required to join internship.
142 likes
2 hours ago
Apply now.`;

  const baselineHash = computeSha256(normalizeText(baselineText));

  it("returns NO_CHANGE when content hash matches baseline exactly", () => {
    const res = classifyWatchCheck([], baselineText, baselineHash, baselineText);
    expect(res.type).toBe("NO_CHANGE");
  });

  it("returns NO_CHANGE when only volatile counters/timestamps change", () => {
    const volatileModifiedText = `# Internship Scam Alert
CareerBridge Global posted:
Mandatory fee of Rs 2,499 required to join internship.
180 likes
3 hours ago
Apply now.`;

    const res = classifyWatchCheck([], volatileModifiedText, baselineHash, baselineText);
    expect(res.type).toBe("NO_CHANGE");
    expect(res.reason).toContain("Only volatile timestamps or engagement counters updated");
  });

  it("returns EDITED with diff when meaningful text is altered", () => {
    const alteredText = `# Internship Scam Alert
CareerBridge Global posted:
Mandatory fee of Rs 4,999 required to join internship. Transfer to new-upi@axis.
142 likes
2 hours ago
Apply now.`;

    const res = classifyWatchCheck([], alteredText, baselineHash, baselineText);
    expect(res.type).toBe("EDITED");
    expect(res.diff).toBeDefined();
    expect(res.diff?.hasMeaningfulChange).toBe(true);
    expect(res.diff?.unifiedDiff).toContain("4,999");
  });

  it("returns DELETED when error includes 404 or page_not_found", () => {
    const res = classifyWatchCheck(
      [{ code: "page_not_found", status: 404 }],
      "",
      baselineHash,
      baselineText
    );
    expect(res.type).toBe("DELETED");
    expect(res.reason).toContain("404/410");
  });

  it("returns DELETED when text matches removal phrases", () => {
    const removedPageText = "Error 404: This post has been removed by the author.";
    const res = classifyWatchCheck([], removedPageText, baselineHash, baselineText);
    expect(res.type).toBe("DELETED");
    expect(res.reason).toContain("this post has been removed");
  });

  it("returns BLOCKED on bot detection or login barriers without marking deleted", () => {
    const res = classifyWatchCheck(
      [{ code: "bot_blocked", message: "Cloudflare challenge presented" }],
      "",
      baselineHash,
      baselineText
    );
    expect(res.type).toBe("BLOCKED");
    expect(res.newContentHash).toBe(baselineHash); // Retains baseline
  });
});
