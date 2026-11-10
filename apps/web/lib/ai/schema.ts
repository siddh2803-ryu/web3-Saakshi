import { z } from "zod";
import { REPORTING_CHANNEL_IDS } from "./channels";

export const ReportingChannelIdSchema = z.enum(REPORTING_CHANNEL_IDS);
export type ReportingChannelId = z.infer<typeof ReportingChannelIdSchema>;

export const PartySchema = z.object({
  name: z.string().nullable(),
  handle: z.string().nullable(),
  role: z.enum(["author", "mentioned", "commenter", "organisation"]),
});

export const TimestampFoundSchema = z.object({
  text: z.string(),
  context: z.string(),
});

export const PossibleIssueCategorySchema = z.object({
  category: z.enum([
    "harassment",
    "impersonation",
    "morphed_image",
    "financial_fraud",
    "fake_job",
    "defamation",
    "consumer_dispute",
    "ip_infringement",
    "hate_speech",
    "other",
  ]),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string(),
});

/**
 * Zod preprocessor to ensure that ANY URL returned by the model in suggested_channel_ids
 * is immediately dropped. The model is only allowed to return stable channel IDs
 * (ncrp, nch, ejagriti, platform_go, police).
 * Real destination URLs always originate from trusted constants (PRD 12.2, 12.3).
 */
export const SuggestedChannelIdsSchema = z.preprocess((val) => {
  if (!Array.isArray(val)) return val;
  return val
    .filter((item) => {
      if (typeof item !== "string") return false;
      const lower = item.toLowerCase().trim();
      // Drop any item containing web protocols or paths
      if (
        lower.startsWith("http://") ||
        lower.startsWith("https://") ||
        lower.includes("://") ||
        lower.includes("/")
      ) {
        return false;
      }
      return true;
    })
    .map((item) => (typeof item === "string" ? item.trim() : item));
}, z.array(ReportingChannelIdSchema));

/**
 * Strict schema for evidence analysis output matching PRD Section 12.2.
 */
export const AiAnalysisSchema = z.object({
  status: z
    .enum(["SUCCESS", "UNAVAILABLE", "FAILED", "SKIPPED"])
    .optional()
    .default("SUCCESS"),
  summary_en: z.string().describe("Factual summary in plain English (max 120 words)"),
  summary_hi: z.string().describe("Factual summary in simple Devanagari Hindi"),
  content_type: z.enum([
    "social_post",
    "profile",
    "listing",
    "job_offer",
    "article",
    "message",
    "other",
  ]),
  parties: z.array(PartySchema),
  key_claims: z.array(z.string()),
  timestamps_found: z.array(TimestampFoundSchema),
  possible_issue_categories: z.array(PossibleIssueCategorySchema),
  suggested_channel_ids: SuggestedChannelIdsSchema,
  complaint_draft_en: z
    .string()
    .describe("Polite, objective draft complaint in English with placeholders"),
  complaint_draft_hi: z
    .string()
    .describe("Polite, objective draft complaint in Hindi with placeholders"),
  repost_phrases: z
    .array(z.string())
    .max(2)
    .describe("Max 2 distinctive phrases (<= 12 words) to locate reposts/mirrors"),
  caveats: z.array(z.string()).min(1, "At least one legal disclaimer caveat is required"),
  isFallback: z.boolean().optional(),
  fallbackBadge: z.string().optional(),
  error: z.string().optional(),
});

export type AiAnalysisOutput = z.infer<typeof AiAnalysisSchema>;

/**
 * Drops any external URLs that might be present in untrusted model output strings.
 */
export function dropUrlsFromText(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/gi, "[link dropped]");
}
