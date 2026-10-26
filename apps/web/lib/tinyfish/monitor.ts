import { isFixtureMode, tinyFishFetch } from "./client";
import { FIXTURE_MONITOR_RESPONSE } from "./fixtures";

export interface MonitorItem {
  id: string;
  type: string;
  name: string;
  status: string;
  schedule_cron: string;
  created_at?: string;
}

export interface MonitorRunResultItem {
  text?: string;
  final_url?: string;
  title?: string;
  status?: number;
}

export interface MonitorRunResponse {
  id: string;
  is_baseline?: boolean;
  status: string;
  results?: MonitorRunResultItem[];
  errors?: Array<{ code: string; message?: string; status?: number }>;
}

export interface MonitorCreateResponse {
  monitor: MonitorItem;
  run?: MonitorRunResponse;
}

export interface CreateMonitorOptions {
  captureId: string;
  url: string;
  scheduleCron?: string;
  webhookUrl?: string;
  purpose?: string;
}

/**
 * Creates a recurring TinyFish Page Monitor to watch for edits or page removal.
 */
export async function createPageMonitor(options: CreateMonitorOptions): Promise<MonitorCreateResponse> {
  if (isFixtureMode()) {
    return FIXTURE_MONITOR_RESPONSE;
  }

  const payload = {
    type: "fetch",
    name: `saakshi-${options.captureId}`,
    config: {
      url: options.url,
      format: "markdown",
    },
    schedule_cron: options.scheduleCron || "0 * * * *", // default hourly
    purpose:
      options.purpose ||
      "Evidence watch. Flag any change to the main post text, author, media or comments, and flag if the page is removed, made private or shows 'content unavailable'.",
    webhook_url: options.webhookUrl,
  };

  const res = await tinyFishFetch<MonitorCreateResponse>(
    "https://agent.tinyfish.ai/v1/monitors",
    {
      method: "POST",
      body: payload,
      timeoutMs: 40000,
    }
  );

  return res;
}

/**
 * Manually executes a monitor check immediately (Run Now).
 * Run Now does not dispatch webhooks, so result is returned directly to be processed inline.
 */
export async function runMonitorNow(monitorId: string): Promise<MonitorRunResponse> {
  if (isFixtureMode() || monitorId.startsWith("mon_fixture_")) {
    return {
      id: `run_now_${Date.now()}`,
      status: "COMPLETED",
      results: FIXTURE_MONITOR_RESPONSE.run?.results || [],
      errors: [],
    };
  }

  const res = await tinyFishFetch<MonitorRunResponse>(
    `https://agent.tinyfish.ai/v1/monitors/${monitorId}/runs`,
    {
      method: "POST",
      timeoutMs: 45000,
    }
  );

  return res;
}

/**
 * Updates monitor status (e.g. pause, resume, change schedule).
 */
export async function updateMonitor(
  monitorId: string,
  updates: { status?: "active" | "paused"; schedule_cron?: string }
): Promise<MonitorItem> {
  if (isFixtureMode() || monitorId.startsWith("mon_fixture_")) {
    return {
      ...FIXTURE_MONITOR_RESPONSE.monitor,
      ...updates,
    };
  }

  const res = await tinyFishFetch<MonitorItem>(
    `https://agent.tinyfish.ai/v1/monitors/${monitorId}`,
    {
      method: "PATCH",
      body: updates,
    }
  );

  return res;
}

/**
 * Deletes a TinyFish Page Monitor.
 */
export async function deleteMonitor(monitorId: string): Promise<boolean> {
  if (isFixtureMode() || monitorId.startsWith("mon_fixture_")) {
    return true;
  }

  try {
    await tinyFishFetch(`https://agent.tinyfish.ai/v1/monitors/${monitorId}`, {
      method: "DELETE",
    });
    return true;
  } catch {
    return false;
  }
}
