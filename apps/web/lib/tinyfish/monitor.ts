import { z } from "zod";
import { isFixtureMode, sanitizeUrl, tinyFishFetch } from "./client";
import { FIXTURE_MONITOR_RESPONSE } from "./fixtures";

export const DEFAULT_MONITOR_PURPOSE =
  "Evidence watch. Flag any change to the main post text, author, media or comments, and flag if the page is removed, made private or shows 'content unavailable'.";

export const DEFAULT_MONITOR_SCHEDULE = "CRON_TZ=Asia/Kolkata 0 * * * *";

// ---------------------------------------------------------------------------
// Zod Schemas aligned with OpenAPI Spec (https://agent.tinyfish.ai/v1/openapi/monitor)
// ---------------------------------------------------------------------------

export const MonitorConfigSchema = z
  .object({
    url: z.string().url(),
    format: z.enum(["markdown", "html", "json"]).default("markdown"),
    links: z.boolean().optional(),
    image_links: z.boolean().optional(),
    ttl: z.number().int().optional(),
  })
  .passthrough();

export const MonitorErrorSchema = z
  .object({
    url: z.string().optional(),
    error: z.string().optional(),
    code: z.string().optional(),
    message: z.string().optional(),
    status: z.number().optional(),
    unmatched_selectors: z.array(z.string()).optional(),
    candidate_selectors: z.array(z.string()).optional(),
  })
  .passthrough();

export const MonitorRunResultItemSchema = z
  .object({
    url: z.string().optional(),
    final_url: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    format: z.string().optional(),
    text: z.union([z.string(), z.record(z.unknown()), z.null()]).optional(),
    author: z.string().nullable().optional(),
    published_date: z.string().nullable().optional(),
    links: z.array(z.string()).optional(),
    image_links: z.array(z.string()).optional(),
    iframe_links: z.array(z.string()).optional(),
    latency_ms: z.number().nullable().optional(),
    not_modified: z.boolean().optional(),
    etag: z.string().nullable().optional(),
    last_modified: z.string().nullable().optional(),
    status: z.number().optional(),
  })
  .passthrough();

export const MonitorRunSchema = z
  .object({
    id: z.string(),
    request_id: z.string().optional(),
    is_baseline: z.boolean().optional(),
    status: z.string().optional(),
    results: z.array(MonitorRunResultItemSchema).default([]),
    errors: z.array(MonitorErrorSchema).default([]),
    created_at: z.string().optional(),
  })
  .passthrough();

export const MonitorItemSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().optional(),
    schedule_cron: z.string(),
    status: z.enum(["creating", "active", "paused", "failed", "cancelled"]),
    last_error: z.string().nullable().optional(),
    webhook_url: z.string().nullable().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    type: z.enum(["fetch", "search"]),
    config: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const MonitorCreateResponseSchema = z.object({
  monitor: MonitorItemSchema,
  run: MonitorRunSchema,
});

export const MonitorRunNowResponseSchema = z.object({
  run: MonitorRunSchema,
});

export const MonitorListResponseSchema = z.object({
  monitors: z.array(MonitorItemSchema),
});

export const MonitorDeleteResponseSchema = z.object({
  deleted: z.literal(true),
  id: z.string(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript Types
// ---------------------------------------------------------------------------

export type MonitorItem = z.infer<typeof MonitorItemSchema>;
export type MonitorRunResultItem = z.infer<typeof MonitorRunResultItemSchema>;
export type MonitorError = z.infer<typeof MonitorErrorSchema>;
export type MonitorRun = z.infer<typeof MonitorRunSchema>;
export type MonitorRunResponse = MonitorRun; // Compatibility alias
export type MonitorCreateResponse = z.infer<typeof MonitorCreateResponseSchema>;
export type MonitorDeleteResponse = z.infer<typeof MonitorDeleteResponseSchema>;

export interface CreateMonitorOptions {
  captureId: string;
  url: string;
  scheduleCron?: string;
  webhookUrl?: string;
  purpose?: string;
}

export interface UpdateMonitorInput {
  status?: "active" | "paused";
  schedule_cron?: string;
  name?: string | null;
  webhook_url?: string | null;
  purpose?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultWebhookUrl(): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) return undefined;
  return `${appUrl}/api/webhooks/monitor?token=${webhookSecret}`;
}

// ---------------------------------------------------------------------------
// Monitor API Client Functions
// ---------------------------------------------------------------------------

/**
 * Creates a recurring TinyFish Page Monitor to watch for edits or page removal.
 * POST /v1/monitors with type "fetch", format "markdown", schedule_cron, name "saakshi-<captureId>",
 * purpose and webhook_url.
 */
export async function createPageMonitor(options: CreateMonitorOptions): Promise<MonitorCreateResponse> {
  if (isFixtureMode()) {
    return FIXTURE_MONITOR_RESPONSE;
  }

  const webhook = options.webhookUrl || getDefaultWebhookUrl();

  const payload = {
    type: "fetch" as const,
    name: `saakshi-${options.captureId}`,
    config: {
      url: options.url,
      format: "markdown" as const,
    },
    schedule_cron: options.scheduleCron || DEFAULT_MONITOR_SCHEDULE,
    purpose: options.purpose || DEFAULT_MONITOR_PURPOSE,
    ...(webhook ? { webhook_url: webhook } : {}),
  };

  // Note: we never log payload.webhook_url with token; sanitizeUrl used if logging
  const res = await tinyFishFetch<unknown>(
    "https://agent.tinyfish.ai/v1/monitors",
    {
      method: "POST",
      body: payload,
      timeoutMs: 45000,
      retries: 1,
      retryDelayMs: 2000,
    }
  );

  const parsed = MonitorCreateResponseSchema.safeParse(res);
  if (!parsed.success) {
    throw new Error(`TinyFish createMonitor response malformed: ${parsed.error.message}`);
  }

  return parsed.data;
}

/**
 * Manually executes a monitor check immediately (Run Now).
 * POST /v1/monitors/{id}/runs returns the run inline (run-now never triggers the webhook).
 */
export async function runMonitorNow(monitorId: string): Promise<MonitorRun> {
  if (isFixtureMode() || monitorId.startsWith("mon_fixture_")) {
    return {
      id: `run_now_${Date.now()}`,
      status: "COMPLETED",
      is_baseline: false,
      results: FIXTURE_MONITOR_RESPONSE.run?.results || [],
      errors: [],
    };
  }

  let raw: unknown;
  try {
    raw = await tinyFishFetch<unknown>(
      `https://agent.tinyfish.ai/v1/monitors/${monitorId}/runs`,
      {
        method: "POST",
        timeoutMs: 45000,
        retries: 1,
        retryDelayMs: 2000,
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If upstream fetch failed because page is deleted/not found (HTTP 404/502 with page_not_found)
    if (msg.includes("page_not_found") || msg.includes("404")) {
      return {
        id: `run_notfound_${Date.now()}`,
        status: "FAILED",
        results: [],
        errors: [{ code: "page_not_found", status: 404, message: "Target page not found (HTTP 404)" }],
      };
    }
    if (msg.includes("bot_blocked")) {
      return {
        id: `run_blocked_${Date.now()}`,
        status: "FAILED",
        results: [],
        errors: [{ code: "bot_blocked", message: "Bot blocked" }],
      };
    }
    throw err;
  }

  const parsed = MonitorRunNowResponseSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data.run;
  }

  // Defensive fallback: if raw was returned already as the run object
  const directRunParsed = MonitorRunSchema.safeParse(raw);
  if (directRunParsed.success) {
    return directRunParsed.data;
  }

  throw new Error(`TinyFish run-now response malformed: ${parsed.error.message}`);
}

/**
 * Retrieves a monitor by ID.
 * GET /v1/monitors/{id}
 */
export async function getMonitor(monitorId: string): Promise<MonitorItem> {
  if (isFixtureMode() || monitorId.startsWith("mon_fixture_")) {
    return FIXTURE_MONITOR_RESPONSE.monitor;
  }

  const raw = await tinyFishFetch<unknown>(
    `https://agent.tinyfish.ai/v1/monitors/${monitorId}`,
    {
      method: "GET",
      timeoutMs: 20000,
      retries: 1,
    }
  );

  const parsed = MonitorItemSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`TinyFish getMonitor response malformed: ${parsed.error.message}`);
  }

  return parsed.data;
}

/**
 * Lists monitors on the account.
 * GET /v1/monitors
 */
export async function listMonitors(): Promise<MonitorItem[]> {
  if (isFixtureMode()) {
    return [FIXTURE_MONITOR_RESPONSE.monitor];
  }

  const raw = await tinyFishFetch<unknown>(
    "https://agent.tinyfish.ai/v1/monitors",
    {
      method: "GET",
      timeoutMs: 20000,
      retries: 1,
    }
  );

  const parsed = MonitorListResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`TinyFish listMonitors response malformed: ${parsed.error.message}`);
  }

  return parsed.data.monitors;
}

/**
 * Updates a monitor (e.g. pause, resume, change schedule).
 * PATCH /v1/monitors/{id}
 */
export async function updateMonitor(
  monitorId: string,
  updates: UpdateMonitorInput
): Promise<MonitorItem> {
  if (isFixtureMode() || monitorId.startsWith("mon_fixture_")) {
    return {
      ...FIXTURE_MONITOR_RESPONSE.monitor,
      ...updates,
      status: updates.status || FIXTURE_MONITOR_RESPONSE.monitor.status,
    };
  }

  const raw = await tinyFishFetch<unknown>(
    `https://agent.tinyfish.ai/v1/monitors/${monitorId}`,
    {
      method: "PATCH",
      body: updates,
      timeoutMs: 20000,
      retries: 1,
    }
  );

  const parsed = MonitorItemSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`TinyFish updateMonitor response malformed: ${parsed.error.message}`);
  }

  return parsed.data;
}

/**
 * Pauses an active monitor.
 */
export async function pauseMonitor(monitorId: string): Promise<MonitorItem> {
  return updateMonitor(monitorId, { status: "paused" });
}

/**
 * Resumes a paused monitor.
 */
export async function resumeMonitor(monitorId: string): Promise<MonitorItem> {
  return updateMonitor(monitorId, { status: "active" });
}

/**
 * Updates the cron schedule of a monitor.
 */
export async function changeMonitorSchedule(
  monitorId: string,
  scheduleCron: string
): Promise<MonitorItem> {
  return updateMonitor(monitorId, { schedule_cron: scheduleCron });
}

/**
 * Deletes a TinyFish Page Monitor.
 * DELETE /v1/monitors/{id} returns { deleted: true, id: string }
 */
export async function deleteMonitor(
  monitorId: string
): Promise<{ deleted: boolean; id: string }> {
  if (isFixtureMode() || monitorId.startsWith("mon_fixture_")) {
    return { deleted: true, id: monitorId };
  }

  const raw = await tinyFishFetch<unknown>(
    `https://agent.tinyfish.ai/v1/monitors/${monitorId}`,
    {
      method: "DELETE",
      timeoutMs: 20000,
      retries: 1,
    }
  );

  const parsed = MonitorDeleteResponseSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  return { deleted: true, id: monitorId };
}
