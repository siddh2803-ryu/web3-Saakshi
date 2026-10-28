import { z } from "zod";

/**
 * Media item in Agent Run Result
 */
export const AgentMediaItemSchema = z.object({
  type: z.string(),
  url: z.string(),
});

/**
 * Engagement metrics in Agent Run Result
 */
export const AgentEngagementSchema = z
  .object({
    likes: z.string().nullable().optional(),
    comments: z.string().nullable().optional(),
    shares: z.string().nullable().optional(),
    views: z.string().nullable().optional(),
  })
  .optional();

/**
 * Comment in Agent Run Result
 */
export const AgentCommentSchema = z.object({
  author: z.string().optional(),
  text: z.string(),
  time_text: z.string().nullable().optional(),
});

/**
 * Exact Agent Run Result Schema matching PRD Section 7.1 output_schema
 * Required top-level fields: blocked, media, comments
 */
export const AgentRunResultSchema = z.object({
  page_title: z.string().nullable().optional(),
  platform: z.string().nullable().optional(),
  author_name: z.string().nullable().optional(),
  author_handle: z.string().nullable().optional(),
  author_profile_url: z.string().nullable().optional(),
  published_at_text: z.string().nullable().optional(),
  content_text: z.string().nullable().optional(),
  media: z.array(AgentMediaItemSchema),
  engagement: AgentEngagementSchema,
  comments: z.array(AgentCommentSchema),
  blocked: z.boolean(),
  block_reason: z.string().nullable().optional(),
});

export type AgentRunResult = z.infer<typeof AgentRunResultSchema>;

/**
 * Step detail in Agent Run
 */
export const TinyFishAgentStepSchema = z.object({
  id: z.string(),
  timestamp: z.string().nullable().optional(),
  status: z.string(),
  action: z.string(),
  screenshot: z.string().nullable().optional(), // base64 data URI
  html: z.string().nullable().optional(),
  duration: z.union([z.number(), z.string()]).nullable().optional(),
});

export type TinyFishAgentStep = z.infer<typeof TinyFishAgentStepSchema>;

/**
 * Agent Run Status Enum
 */
export const AgentRunStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

/**
 * Full Agent Run Response from GET /v1/runs/{id}
 */
export const AgentRunResponseSchema = z
  .object({
    run_id: z.string(),
    status: AgentRunStatusSchema,
    streaming_url: z.string().nullable().optional(),
    num_of_steps: z.number().optional(),
    result: AgentRunResultSchema.nullable().optional(),
    error: z.string().nullable().optional(),
    video_url: z.string().nullable().optional(),
    steps: z.array(TinyFishAgentStepSchema).optional(),
    _metadata: z
      .object({
        source: z.enum(["synthetic", "recorded"]),
        createdAt: z.string().optional(),
        recordedAt: z.string().optional(),
        notes: z.string().optional(),
        runId: z.string().optional(),
        targetUrl: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export type AgentRunResponse = z.infer<typeof AgentRunResponseSchema>;

/**
 * API Request Schemas
 */
export const NewCaptureRequestSchema = z.object({
  url: z.string().min(1, "Target URL is required"),
  goal: z.string().max(300, "Goal exceeds 300 character limit").optional(),
  mode: z.enum(["standard", "deep"]).default("standard"),
  consent: z.literal(true, {
    errorMap: () => ({ message: "Preservation consent must be acknowledged." }),
  }),
  uid: z.string().default("demo-user"),
  caseId: z.string().optional(),
});

export type NewCaptureRequest = z.infer<typeof NewCaptureRequestSchema>;

export const SandboxAdminRequestSchema = z.object({
  action: z.enum(["edit", "delete", "restore", "reset"]),
  slug: z.string().optional(),
  text: z.string().optional(),
  secret: z.string(),
});

export type SandboxAdminRequest = z.infer<typeof SandboxAdminRequestSchema>;

export const WebhookPayloadSchema = z.object({
  run_id: z.string().optional(),
  id: z.string().optional(),
  status: z.string().optional(),
  event: z.string().optional(),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;
