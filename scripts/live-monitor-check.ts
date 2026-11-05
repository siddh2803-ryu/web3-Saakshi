import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Ensure live mode is active
process.env.TINYFISH_MODE = "live";

async function runLiveMonitorCheck() {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    console.error("❌ ERROR: TINYFISH_API_KEY is not set in .env.local or environment.");
    process.exit(1);
  }

  console.log("=== TinyFish Monitor API Live Verification (PRD 6 F8, 7.5) ===");
  console.log("Target: https://example.com");
  console.log("Schedule: Daily (0 0 * * *)\n");

  const {
    createPageMonitor,
    runMonitorNow,
    deleteMonitor,
  } = await import("../apps/web/lib/tinyfish/monitor");
  const { classifyWatchRun } = await import("../apps/web/lib/watch/classify");
  const { computeSha256 } = await import("../apps/web/lib/evidence/hash");
  const { normalizeWatchText } = await import("../apps/web/lib/watch/diff");

  let createdMonitorId: string | null = null;

  try {
    // 1. Create monitor with daily schedule
    console.log("1. Creating TinyFish page monitor...");
    const captureId = `check_${Date.now()}`;
    const createRes = await createPageMonitor({
      captureId,
      url: "https://example.com",
      scheduleCron: "0 0 * * *",
    });

    createdMonitorId = createRes.monitor.id;
    console.log(`✓ Monitor created successfully!`);
    console.log(`  Monitor ID:   ${createRes.monitor.id}`);
    console.log(`  Name:         ${createRes.monitor.name}`);
    console.log(`  Status:       ${createRes.monitor.status}`);
    console.log(`  Schedule:     ${createRes.monitor.schedule_cron}`);
    console.log(`  Baseline Run: ${createRes.run.id} (is_baseline: ${createRes.run.is_baseline})`);

    const rawBaselineText = createRes.run.results?.[0]?.text;
    const baselineText = typeof rawBaselineText === "string" ? rawBaselineText : "";
    const baselineHash = computeSha256(normalizeWatchText(baselineText));
    console.log(`  Baseline Hash: ${baselineHash}`);
    console.log(`  Baseline Text: ${baselineText.length} characters`);

    // 2. First runNow
    console.log("\n2. Executing runNow (Check #1)...");
    const run1 = await runMonitorNow(createdMonitorId);
    console.log(`✓ Check #1 completed!`);
    console.log(`  Run ID:    ${run1.id}`);
    console.log(`  Results:   ${run1.results?.length ?? 0}`);
    console.log(`  Errors:    ${run1.errors?.length ?? 0}`);

    const classification1 = classifyWatchRun({
      results: run1.results,
      errors: run1.errors,
      lastKnownContentHash: baselineHash,
      previousText: baselineText,
    });
    console.log(`  Result:    ${classification1.type}`);
    console.log(`  Reason:    ${classification1.reason}`);
    console.log(`  Hash:      ${classification1.newContentHash}`);

    // 3. Second runNow
    console.log("\n3. Executing runNow (Check #2)...");
    const run2 = await runMonitorNow(createdMonitorId);
    console.log(`✓ Check #2 completed!`);
    console.log(`  Run ID:    ${run2.id}`);
    console.log(`  Results:   ${run2.results?.length ?? 0}`);
    console.log(`  Errors:    ${run2.errors?.length ?? 0}`);

    const classification2 = classifyWatchRun({
      results: run2.results,
      errors: run2.errors,
      lastKnownContentHash: baselineHash,
      previousText: baselineText,
    });
    console.log(`  Result:    ${classification2.type}`);
    console.log(`  Reason:    ${classification2.reason}`);
    console.log(`  Hash:      ${classification2.newContentHash}`);

    // Summary of checks
    console.log("\n=== Live Verification Summary ===");
    console.log(`Monitor ID:       ${createdMonitorId}`);
    console.log(`Run 1 Result:     ${classification1.type} (${classification1.reason})`);
    console.log(`Run 2 Result:     ${classification2.type} (${classification2.reason})`);
    console.log(`Consistent Hash:  ${classification1.newContentHash === classification2.newContentHash}`);
  } catch (err: unknown) {
    console.error("❌ Live check encountered an error:", err instanceof Error ? err.message : String(err));
  } finally {
    // 4. Delete the monitor
    if (createdMonitorId) {
      console.log(`\n4. Cleaning up monitor (${createdMonitorId})...`);
      try {
        const delRes = await deleteMonitor(createdMonitorId);
        console.log(`✓ Monitor deleted: ${delRes.deleted} (ID: ${delRes.id})`);
      } catch (delErr: unknown) {
        console.error("❌ Failed to delete monitor:", delErr instanceof Error ? delErr.message : String(delErr));
      }
    }
  }
}

runLiveMonitorCheck();
