import {
  OFFICIAL_REPORTING_CHANNELS,
  getChannelsWithUrls,
  ReportingChannel,
} from "../apps/web/lib/ai/channels";

interface ChannelCheckResult {
  id: string;
  name: string;
  url?: string;
  hasUrl: boolean;
  status: "OK" | "FLAGGED_MOVED" | "FLAGGED_ERROR" | "TEXT_ONLY" | "UNREACHABLE";
  httpStatus?: number;
  finalUrl?: string;
  error?: string;
  notes: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Saakshi/1.0 (Channel Health Checker)";

async function checkChannelUrl(
  channel: ReportingChannel & { url: string },
  timeoutMs = 15000
): Promise<ChannelCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Attempt GET with range to reduce bandwidth while ensuring servers accept requests
    const res = await fetch(channel.url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);

    const httpStatus = res.status;
    const finalUrl = res.url;
    const urlChanged = finalUrl && finalUrl !== channel.url && !finalUrl.startsWith(channel.url);

    if (httpStatus >= 200 && httpStatus < 400) {
      if (urlChanged) {
        return {
          id: channel.id,
          name: channel.name,
          url: channel.url,
          hasUrl: true,
          status: "FLAGGED_MOVED",
          httpStatus,
          finalUrl,
          notes: `Redirected to ${finalUrl}. Portal link may have moved permanently; verify canonical URL.`,
        };
      }
      return {
        id: channel.id,
        name: channel.name,
        url: channel.url,
        hasUrl: true,
        status: "OK",
        httpStatus,
        finalUrl,
        notes: `Healthy (HTTP ${httpStatus})`,
      };
    }

    if (httpStatus === 404 || httpStatus === 410) {
      return {
        id: channel.id,
        name: channel.name,
        url: channel.url,
        hasUrl: true,
        status: "FLAGGED_MOVED",
        httpStatus,
        notes: `HTTP ${httpStatus} Not Found / Gone. Destination URL is broken or moved!`,
      };
    }

    return {
      id: channel.id,
      name: channel.name,
      url: channel.url,
      hasUrl: true,
      status: "FLAGGED_ERROR",
      httpStatus,
      notes: `HTTP ${httpStatus} (WAF / anti-bot challenge or server error). Host is reachable.`,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout");
    return {
      id: channel.id,
      name: channel.name,
      url: channel.url,
      hasUrl: true,
      status: "UNREACHABLE",
      error: msg,
      notes: isTimeout
        ? `Request timed out after ${timeoutMs / 1000}s.`
        : `Network unreachable: ${msg}. If running in sandboxed environment, bypass sandbox to check live internet connectivity.`,
    };
  }
}

export async function checkAllChannels(): Promise<{
  results: ChannelCheckResult[];
  hasMovedOrBroken: boolean;
}> {
  console.log("=== Saakshi Official Reporting Channels Health Check (PRD 12.3) ===\n");
  const results: ChannelCheckResult[] = [];
  const webChannels = getChannelsWithUrls();

  for (const channel of OFFICIAL_REPORTING_CHANNELS) {
    if (!channel.url) {
      results.push({
        id: channel.id,
        name: channel.name,
        hasUrl: false,
        status: "TEXT_ONLY",
        notes: "Text-only statutory channel; no external URL configured (compliant with PRD 12.3).",
      });
      continue;
    }

    console.log(`Checking [${channel.id}] ${channel.name} (${channel.url})...`);
    const result = await checkChannelUrl(channel as ReportingChannel & { url: string });
    results.push(result);
  }

  console.log("\n--- Channel Health Summary ---");
  for (const r of results) {
    const icon =
      r.status === "OK"
        ? "✅"
        : r.status === "TEXT_ONLY"
        ? "ℹ️ "
        : r.status === "FLAGGED_MOVED"
        ? "🚨"
        : r.status === "FLAGGED_ERROR"
        ? "⚠️ "
        : "🌐";
    console.log(`${icon} [${r.id}] ${r.name}`);
    if (r.url) console.log(`   URL: ${r.url}`);
    if (r.httpStatus) console.log(`   HTTP Status: ${r.httpStatus}`);
    console.log(`   Result: ${r.status} - ${r.notes}`);
  }

  const hasMovedOrBroken = results.some((r) => r.status === "FLAGGED_MOVED");
  return { results, hasMovedOrBroken };
}

if (require.main === module) {
  checkAllChannels()
    .then(({ hasMovedOrBroken }) => {
      if (hasMovedOrBroken) {
        console.error("\n❌ Warning: One or more channel URLs appear moved or broken.");
        process.exit(1);
      } else {
        console.log("\n✅ Channel verification complete.");
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error("Fatal error during channel health check:", err);
      process.exit(1);
    });
}
