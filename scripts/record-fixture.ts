/**
 * scripts/record-fixture.ts
 *
 * Tooling to record real TinyFish agent runs and persist them as fixtures (PRD Section 7.8).
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/record-fixture.ts [run_id | target_url]
 *
 * Requirements:
 *   - Requires TINYFISH_API_KEY in environment or .env.local
 *   - Stamped with _metadata: { source: "recorded", recordedAt, ... }
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { buildAgentGoal, AGENT_OUTPUT_SCHEMA } from "../apps/web/lib/tinyfish/prompts";
import { AgentRunResultSchema, AgentRunResponseSchema } from "../apps/web/lib/tinyfish/schemas";

// Load environment variables
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
const webEnvPath = path.resolve(process.cwd(), "apps/web/.env.local");
if (fs.existsSync(webEnvPath)) {
  dotenv.config({ path: webEnvPath });
}

const apiKey = process.env.TINYFISH_API_KEY;

async function main() {
  const arg = process.argv[2];

  console.log("=== Saakshi / TinyFish Fixture Recorder ===");

  if (!apiKey || apiKey.includes("your_") || apiKey.trim() === "") {
    console.error("❌ ERROR: No valid TINYFISH_API_KEY found in .env.local or environment.");
    console.log("To record real fixtures from live TinyFish runs:");
    console.log("1. Add TINYFISH_API_KEY=<your-key> to .env.local");
    console.log("2. Run: npx ts-node -r tsconfig-paths/register scripts/record-fixture.ts [run_id | target_url]");
    console.log("\nSkipping live recording. Marking Phase 1 live capture as PENDING.");
    process.exit(0);
  }

  const outputDir = path.resolve(process.cwd(), "apps/web/fixtures");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // If a run_id was provided (starts with "run_")
  if (arg && arg.startsWith("run_")) {
    console.log(`📡 Fetching live run details for run_id: ${arg}...`);
    const res = await fetch(`https://agent.tinyfish.ai/v1/runs/${arg}?screenshots=base64`, {
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Failed to fetch run ${arg} (${res.status}): ${errText}`);
      process.exit(1);
    }

    const runData = await res.json();
    const recordedFixture = {
      _metadata: {
        source: "recorded",
        recordedAt: new Date().toISOString(),
        runId: arg,
        stepCount: runData.steps?.length || runData.num_of_steps || 0,
      },
      ...runData,
    };

    const outPath = path.join(outputDir, "recorded_sandbox_run.json");
    fs.writeFileSync(outPath, JSON.stringify(recordedFixture, null, 2), "utf8");
    console.log(`✅ Successfully recorded live run to ${outPath}`);
    console.log(`   Steps: ${recordedFixture._metadata.stepCount}`);
    console.log(`   Status: ${runData.status}`);
    return;
  }

  // Otherwise, initiate a new capture run against the target URL
  const targetUrl = arg || process.env.SANDBOX_RECORD_URL || "https://saakshi.vercel.app/sandbox/post/internship-scam-alert";
  console.log(`🚀 Initiating live agent run against target: ${targetUrl}...`);

  const goal = buildAgentGoal("Capture the internship listing, registration fee demand, UPI payment id, and comments warning of fraud.", "standard");

  const startRes = await fetch("https://agent.tinyfish.ai/v1/automation/run-async", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: targetUrl,
      goal,
      browser_profile: "stealth",
      proxy_config: { enabled: true, type: "tinyfish", country_code: "US" },
      output_schema: AGENT_OUTPUT_SCHEMA,
      agent_config: { max_duration_seconds: 180 },
    }),
  });

  if (!startRes.ok) {
    const errText = await startRes.text();
    console.error(`❌ Failed to start agent run (${startRes.status}): ${errText}`);
    process.exit(1);
  }

  const { run_id } = await startRes.json();
  console.log(`   Agent run initiated with ID: ${run_id}`);
  console.log("   Polling for completion (this may take 30-90s)...");

  let completed = false;
  let attempts = 0;
  while (!completed && attempts < 40) {
    await new Promise((r) => setTimeout(r, 3000));
    attempts++;

    const pollRes = await fetch(`https://agent.tinyfish.ai/v1/runs/${run_id}`, {
      headers: { "X-API-Key": apiKey },
    });

    if (pollRes.ok) {
      const pollData = await pollRes.json();
      console.log(`   [Poll ${attempts}] Status: ${pollData.status} (steps: ${pollData.num_of_steps || 0})`);
      if (pollData.status === "COMPLETED" || pollData.status === "FAILED") {
        completed = true;
      }
    }
  }

  // Fetch full details with base64 screenshots
  console.log("📸 Downloading steps with base64 screenshots...");
  const finalRes = await fetch(`https://agent.tinyfish.ai/v1/runs/${run_id}?screenshots=base64`, {
    headers: { "X-API-Key": apiKey },
  });

  const finalData = await finalRes.json();
  const recordedFixture = {
    _metadata: {
      source: "recorded",
      recordedAt: new Date().toISOString(),
      runId: run_id,
      targetUrl,
      stepCount: finalData.steps?.length || finalData.num_of_steps || 0,
    },
    ...finalData,
  };

  const outPath = path.join(outputDir, "recorded_sandbox_run.json");
  fs.writeFileSync(outPath, JSON.stringify(recordedFixture, null, 2), "utf8");
  console.log(`✅ Successfully saved real TinyFish recording to ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
