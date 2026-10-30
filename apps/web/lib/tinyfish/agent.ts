import { isFixtureMode, tinyFishFetch } from "./client";
import { AGENT_OUTPUT_SCHEMA, buildAgentGoal } from "./prompts";
import { FIXTURE_AGENT_RUN } from "./fixtures";
import {
  AgentRunResponse,
  AgentRunResponseSchema,
  AgentRunResult,
  AgentRunResultSchema,
  TinyFishAgentStep,
} from "./schemas";

export type { AgentRunResponse, AgentRunResult, TinyFishAgentStep };
export type AgentRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface StartAgentOptions {
  url: string;
  userGoal?: string;
  mode?: "standard" | "deep";
  webhookUrl?: string;
}

/**
 * Initiates an asynchronous goal-driven web agent run via TinyFish.
 * Gated fields (agent_config, capture_config) are sent strictly when flags are enabled (PRD Section 7.1).
 */
export async function startAgentRun(options: StartAgentOptions): Promise<{ run_id: string }> {
  if (isFixtureMode()) {
    return { run_id: "run_fixture_tinyfish_001" };
  }

  const goal = buildAgentGoal(options.userGoal, options.mode || "standard");

  const body: Record<string, unknown> = {
    url: options.url,
    goal,
    browser_profile: "stealth",
    proxy_config: { enabled: true, type: "tinyfish", country_code: "US" },
    output_schema: AGENT_OUTPUT_SCHEMA,
  };

  if (options.webhookUrl && options.webhookUrl.startsWith("https://")) {
    body.webhook_url = options.webhookUrl;
  }

  // Beta features (max_steps, mode: strict) gated under TINYFISH_AGENT_BETA
  if (process.env.TINYFISH_AGENT_BETA === "true") {
    body.agent_config = {
      max_duration_seconds: 180,
      mode: "strict",
      max_steps: options.mode === "deep" ? 30 : 15,
    };
  }

  // Account-gated capture configuration (recording, extra snapshots)
  if (process.env.TINYFISH_CAPTURE_CONFIG === "true") {
    body.capture_config = {
      elements: true,
      screenshots: true,
      html: true,
      recording: true,
    };
  }

  const res = await tinyFishFetch<{ run_id: string }>(
    "https://agent.tinyfish.ai/v1/automation/run-async",
    {
      method: "POST",
      body,
      timeoutMs: 30000,
    }
  );

  return res;
}

/**
 * Retrieves the status and step details of an agent run.
 * Fetches steps with screenshots=base64 when includeScreenshots is true.
 * Validates responses against Zod schema (PRD Section 7.1).
 */
export async function getAgentRun(
  runId: string,
  includeScreenshots = false
): Promise<AgentRunResponse> {
  if (isFixtureMode() || runId.startsWith("run_fixture_")) {
    const fixtureData = { ...FIXTURE_AGENT_RUN, run_id: runId };
    return AgentRunResponseSchema.parse(fixtureData);
  }

  const url = includeScreenshots
    ? `https://agent.tinyfish.ai/v1/runs/${runId}?screenshots=base64`
    : `https://agent.tinyfish.ai/v1/runs/${runId}`;

  const rawData = await tinyFishFetch<unknown>(url, {
    method: "GET",
    timeoutMs: 30000,
  });

  const parsed = AgentRunResponseSchema.safeParse(rawData);
  if (!parsed.success) {
    console.warn(`[TinyFish] Response schema validation warning for run ${runId}:`, parsed.error.issues);
    return rawData as AgentRunResponse;
  }

  return parsed.data;
}

/**
 * Cancels an in-flight agent run.
 */
export async function cancelAgentRun(runId: string): Promise<boolean> {
  if (isFixtureMode() || runId.startsWith("run_fixture_")) {
    return true;
  }

  try {
    await tinyFishFetch(`https://agent.tinyfish.ai/v1/runs/${runId}/cancel`, {
      method: "POST",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Inspects agent run result for soft failures (blocked flag, captcha, login required, access denied).
 * Fulfills FR-3.5 and Section 7.1.
 */
export function isRunBlockedOrPartial(result?: AgentRunResult | null): {
  isBlocked: boolean;
  reason: string | null;
} {
  if (!result) return { isBlocked: false, reason: null };

  // Explicit blocked boolean flag
  if (result.blocked) {
    return {
      isBlocked: true,
      reason: result.block_reason || "Access blocked by target page (blocked=true)",
    };
  }

  const contentLower = (result.content_text || "").toLowerCase();
  const titleLower = (result.page_title || "").toLowerCase();
  const reasonLower = (result.block_reason || "").toLowerCase();
  const fullText = `${contentLower} ${titleLower} ${reasonLower}`;

  const blockedKeywords = [
    "blocked",
    "captcha",
    "access denied",
    "login required",
    "please log in",
    "sign in to continue",
    "content not available",
    "content is unavailable",
    "bot detection",
    "challenge required",
    "cloudflare ray id",
    "temporarily restricted",
  ];

  for (const kw of blockedKeywords) {
    if (fullText.includes(kw)) {
      return { isBlocked: true, reason: `Encountered obstacle keyword: "${kw}"` };
    }
  }

  return { isBlocked: false, reason: null };
}
