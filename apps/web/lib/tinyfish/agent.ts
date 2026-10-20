import { isFixtureMode, tinyFishFetch } from "./client";
import { AGENT_OUTPUT_SCHEMA, buildAgentGoal } from "./prompts";
import { FIXTURE_AGENT_RUN } from "./fixtures";

export type AgentRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface TinyFishAgentStep {
  id: string;
  timestamp: string;
  status: string;
  action: string;
  screenshot?: string; // Base64 data URI
  html?: string;
  duration?: number;
}

export interface AgentRunResult {
  page_title?: string | null;
  platform?: string | null;
  author_name?: string | null;
  author_handle?: string | null;
  author_profile_url?: string | null;
  published_at_text?: string | null;
  content_text?: string | null;
  media: Array<{ type: string; url: string }>;
  engagement?: {
    likes?: string | null;
    comments?: string | null;
    shares?: string | null;
    views?: string | null;
  };
  comments: Array<{
    author: string;
    text: string;
    time_text?: string | null;
  }>;
  blocked: boolean;
  block_reason?: string | null;
}

export interface AgentRunResponse {
  run_id: string;
  status: AgentRunStatus;
  streaming_url?: string | null;
  num_of_steps?: number;
  result?: AgentRunResult | null;
  error?: string | null;
  video_url?: string | null;
  steps?: TinyFishAgentStep[];
}

export interface StartAgentOptions {
  url: string;
  userGoal?: string;
  mode?: "standard" | "deep";
  webhookUrl?: string;
}

/**
 * Initiates an asynchronous goal-driven web agent run via TinyFish.
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
    agent_config: {
      max_duration_seconds: 180,
    },
  };

  if (options.webhookUrl) {
    body.webhook_url = options.webhookUrl;
  }

  // Beta features (max_steps, mode: strict)
  if (process.env.TINYFISH_AGENT_BETA === "true") {
    (body.agent_config as Record<string, unknown>).mode = "strict";
    (body.agent_config as Record<string, unknown>).max_steps =
      options.mode === "deep" ? 30 : 15;
  }

  // Account-gated capture config
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
 */
export async function getAgentRun(
  runId: string,
  includeScreenshots = false
): Promise<AgentRunResponse> {
  if (isFixtureMode() || runId.startsWith("run_fixture_")) {
    return { ...FIXTURE_AGENT_RUN, run_id: runId };
  }

  const url = includeScreenshots
    ? `https://agent.tinyfish.ai/v1/runs/${runId}?screenshots=base64`
    : `https://agent.tinyfish.ai/v1/runs/${runId}`;

  const run = await tinyFishFetch<AgentRunResponse>(url, {
    method: "GET",
    timeoutMs: 30000,
  });

  return run;
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
 * Inspects agent run result for soft failures (blocked, captcha, login required).
 */
export function isRunBlockedOrPartial(result?: AgentRunResult | null): {
  isBlocked: boolean;
  reason: string | null;
} {
  if (!result) return { isBlocked: false, reason: null };

  if (result.blocked) {
    return { isBlocked: true, reason: result.block_reason || "Access blocked by page" };
  }

  const contentLower = (result.content_text || "").toLowerCase();
  const titleLower = (result.page_title || "").toLowerCase();
  const reasonLower = (result.block_reason || "").toLowerCase();
  const fullText = `${contentLower} ${titleLower} ${reasonLower}`;

  const blockedKeywords = [
    "captcha",
    "access denied",
    "login required",
    "please log in",
    "sign in to continue",
    "content not available",
    "bot detection",
    "challenge required",
  ];

  for (const kw of blockedKeywords) {
    if (fullText.includes(kw)) {
      return { isBlocked: true, reason: `Encountered obstacle keyword: "${kw}"` };
    }
  }

  return { isBlocked: false, reason: null };
}
