import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Ensure live mode is active
process.env.TINYFISH_MODE = "live";

async function runMonitorCleanup() {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    console.error("❌ ERROR: TINYFISH_API_KEY is not set in .env.local or environment.");
    process.exit(1);
  }

  const isConfirmed = process.argv.includes("--confirm");

  console.log("=== TinyFish Monitor Cleanup ===");
  console.log(`Mode: ${isConfirmed ? "EXECUTE (--confirm provided)" : "DRY RUN (preview only)"}`);
  console.log("Account Monitor Limit: 50 monitors max.\n");

  const { listMonitors, deleteMonitor } = await import("../apps/web/lib/tinyfish/monitor");

  try {
    console.log("Fetching existing monitors from TinyFish...");
    const allMonitors = await listMonitors();
    console.log(`Total monitors in account: ${allMonitors.length} / 50`);

    // Filter monitors named saakshi-*
    const saakshiMonitors = allMonitors.filter((m) => m.name && /^saakshi-/i.test(m.name));

    console.log(`Found ${saakshiMonitors.length} Saakshi monitor(s) matching 'saakshi-*':`);
    for (const m of saakshiMonitors) {
      console.log(`  - [${m.id}] name: "${m.name}", status: ${m.status}, cron: "${m.schedule_cron}"`);
    }

    if (saakshiMonitors.length === 0) {
      console.log("\nNo saakshi-* monitors found to clean up.");
      return;
    }

    if (!isConfirmed) {
      console.log("\n[DRY RUN] No monitors were deleted.");
      console.log("To permanently delete these monitors, run:");
      console.log("  npm run monitor:cleanup -- --confirm\n");
      return;
    }

    console.log(`\nDeleting ${saakshiMonitors.length} monitor(s)...`);
    let deletedCount = 0;

    for (const m of saakshiMonitors) {
      process.stdout.write(`  Deleting monitor ${m.id} ("${m.name}")... `);
      try {
        const res = await deleteMonitor(m.id);
        if (res.deleted) {
          console.log("✓ deleted");
          deletedCount++;
        } else {
          console.log("⚠️  response did not confirm deletion");
        }
      } catch (err: unknown) {
        console.log(`❌ failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log(`\n✓ Cleanup finished. Successfully deleted ${deletedCount} of ${saakshiMonitors.length} monitor(s).`);
  } catch (err: unknown) {
    console.error("❌ Monitor cleanup failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

runMonitorCleanup();
