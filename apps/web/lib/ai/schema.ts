import { z } from "zod";

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

export const AiAnalysisSchema = z.object({
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
  suggested_channel_ids: z.array(z.string()),
  complaint_draft_en: z.string().describe("Polite, objective draft complaint in English with placeholders"),
  complaint_draft_hi: z.string().describe("Polite, objective draft complaint in Hindi with placeholders"),
  repost_phrases: z
    .array(z.string())
    .max(2)
    .describe("Max 2 distinctive phrases (<= 12 words) to locate reposts/mirrors"),
  caveats: z.array(z.string()),
});

export type AiAnalysisOutput = z.infer<typeof AiAnalysisSchema>;
