import { describe, it, expect } from "vitest";
import { AiAnalysisSchema } from "../lib/ai/schema";
import { isRunBlockedOrPartial } from "../lib/tinyfish/agent";

describe("AI Schema & Agent Soft-Failure Inspection", () => {
  it("validates compliant AI analysis JSON schema", () => {
    const validData = {
      summary_en: "A fake job posting asking for upfront payment was preserved.",
      summary_hi: "एक फर्जी जॉब पोस्ट जिसमें अग्रिम भुगतान मांगा गया था, संरक्षित की गई।",
      content_type: "job_offer",
      parties: [
        {
          name: "Scam Recruiter",
          handle: "@recruiter",
          role: "author",
        },
      ],
      key_claims: ["Payment of Rs 2500 demanded before interview."],
      timestamps_found: [{ text: "2 hours ago", context: "relative post time" }],
      possible_issue_categories: [
        {
          category: "fake_job",
          confidence: "high",
          rationale: "Upfront fee solicited for job application.",
        },
      ],
      suggested_channel_ids: ["ncrp", "nch"],
      complaint_draft_en: "Complaint draft in English with [Your Name].",
      complaint_draft_hi: "शिकायत प्रारूप [आपका नाम]।",
      repost_phrases: ["Payment of Rs 2500 demanded"],
      caveats: ["AI-generated draft, not legal advice."],
    };

    const parsed = AiAnalysisSchema.parse(validData);
    expect(parsed.content_type).toBe("job_offer");
    expect(parsed.parties.length).toBe(1);
  });

  it("fails schema validation on illegal categories or missing caveats", () => {
    const invalidData = {
      summary_en: "Short summary.",
      summary_hi: "छोटा सारांश।",
      content_type: "job_offer",
      parties: [],
      key_claims: [],
      timestamps_found: [],
      possible_issue_categories: [
        {
          category: "illegal_category_not_in_enum",
          confidence: "high",
          rationale: "bad",
        },
      ],
      suggested_channel_ids: [],
      complaint_draft_en: "draft",
      complaint_draft_hi: "प्रारूप",
      repost_phrases: [],
      // Missing caveats
    };

    expect(() => AiAnalysisSchema.parse(invalidData)).toThrow();
  });

  it("detects soft failures in agent result (captcha, access denied, login required)", () => {
    expect(isRunBlockedOrPartial({ blocked: true, media: [], comments: [] }).isBlocked).toBe(
      true
    );

    const captchaResult = {
      page_title: "Security Challenge | Cloudflare",
      content_text: "Please complete the captcha to verify you are human.",
      blocked: false,
      media: [],
      comments: [],
    };
    expect(isRunBlockedOrPartial(captchaResult).isBlocked).toBe(true);

    const cleanResult = {
      page_title: "Valid Post",
      content_text: "Normal public discussion without barriers.",
      blocked: false,
      media: [],
      comments: [],
    };
    expect(isRunBlockedOrPartial(cleanResult).isBlocked).toBe(false);
  });
});
