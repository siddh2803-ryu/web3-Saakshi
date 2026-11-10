import { describe, it, expect } from "vitest";
import { AiAnalysisSchema, dropUrlsFromText } from "../lib/ai/schema";
import { isRunBlockedOrPartial } from "../lib/tinyfish/agent";
import {
  OFFICIAL_REPORTING_CHANNELS,
  REPORTING_CHANNEL_IDS,
  isValidChannelId,
  getChannelById,
  getChannelsWithUrls,
} from "../lib/ai/channels";

describe("Reporting Channels Constants (PRD 12.3)", () => {
  it("defines exact 5 stable channel IDs", () => {
    expect(REPORTING_CHANNEL_IDS).toEqual([
      "ncrp",
      "nch",
      "ejagriti",
      "platform_go",
      "police",
    ]);
    expect(OFFICIAL_REPORTING_CHANNELS.length).toBe(5);
  });

  it("ensures text-only entries (platform_go, police) have NO url link", () => {
    const platformGo = getChannelById("platform_go");
    expect(platformGo).toBeDefined();
    expect(platformGo?.url).toBeUndefined();

    const police = getChannelById("police");
    expect(police).toBeDefined();
    expect(police?.url).toBeUndefined();
  });

  it("ensures web entries (ncrp, nch, ejagriti) have valid https URLs", () => {
    const urls = getChannelsWithUrls();
    expect(urls.length).toBe(3);
    for (const channel of urls) {
      expect(channel.url.startsWith("https://")).toBe(true);
    }

    const ncrp = getChannelById("ncrp");
    expect(ncrp?.url).toBe("https://cybercrime.gov.in");

    const nch = getChannelById("nch");
    expect(nch?.url).toBe("https://consumerhelpline.gov.in");

    const ejagriti = getChannelById("ejagriti");
    expect(ejagriti?.url).toBe("https://e-jagriti.gov.in");
  });

  it("validates channel IDs with type guard", () => {
    expect(isValidChannelId("ncrp")).toBe(true);
    expect(isValidChannelId("police")).toBe(true);
    expect(isValidChannelId("unknown_channel")).toBe(false);
    expect(isValidChannelId("https://cybercrime.gov.in")).toBe(false);
    expect(isValidChannelId("")).toBe(false);
  });
});

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

  it("drops any URLs injected into suggested_channel_ids (PRD 12.2)", () => {
    const dataWithUrlsInChannels = {
      summary_en: "A valid summary.",
      summary_hi: "मान्य सारांश।",
      content_type: "social_post" as const,
      parties: [],
      key_claims: ["Claim 1"],
      timestamps_found: [],
      possible_issue_categories: [
        {
          category: "harassment" as const,
          confidence: "medium" as const,
          rationale: "Targeted insults.",
        },
      ],
      suggested_channel_ids: [
        "ncrp",
        "http://evil.example/steal-credentials",
        "https://phishing.site/report",
        "police",
      ],
      complaint_draft_en: "Complaint draft.",
      complaint_draft_hi: "शिकायत प्रारूप।",
      repost_phrases: [],
      caveats: ["Standard disclaimer."],
    };

    const parsed = AiAnalysisSchema.parse(dataWithUrlsInChannels);
    // Injected URLs must be dropped; valid IDs preserved
    expect(parsed.suggested_channel_ids).toEqual(["ncrp", "police"]);
    expect(parsed.suggested_channel_ids).not.toContain("http://evil.example/steal-credentials");
    expect(parsed.suggested_channel_ids).not.toContain("https://phishing.site/report");
  });

  it("fails schema validation on unknown channel IDs", () => {
    const dataWithInvalidId = {
      summary_en: "Summary.",
      summary_hi: "सारांश।",
      content_type: "social_post" as const,
      parties: [],
      key_claims: [],
      timestamps_found: [],
      possible_issue_categories: [
        {
          category: "defamation" as const,
          confidence: "low" as const,
          rationale: "Unverified claims.",
        },
      ],
      suggested_channel_ids: ["unsupported_channel_xyz"],
      complaint_draft_en: "Draft.",
      complaint_draft_hi: "प्रारूप।",
      repost_phrases: [],
      caveats: ["Disclaimer."],
    };

    expect(() => AiAnalysisSchema.parse(dataWithInvalidId)).toThrow();
  });

  it("drops URLs from text via dropUrlsFromText utility", () => {
    const dirtyText =
      "Check out http://evil.example/payload and https://safe.bank.in/login for verification.";
    const cleanText = dropUrlsFromText(dirtyText);
    expect(cleanText).toBe("Check out [link dropped] and [link dropped] for verification.");
    expect(cleanText).not.toContain("http://evil.example");
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
