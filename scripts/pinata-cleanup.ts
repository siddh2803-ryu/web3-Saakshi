import * as dotenv from "dotenv";
import * as path from "path";
import { PinataSDK } from "pinata";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function runPinataCleanup() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt || jwt.trim() === "") {
    console.error("❌ ERROR: PINATA_JWT is not set in .env.local or environment.");
    process.exit(1);
  }

  const gateway = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
  const cleanGateway = gateway.replace(/^https?:\/\//, "").replace(/\/ipfs\/?$/, "");
  const pinata = new PinataSDK({ pinataJwt: jwt.trim(), pinataGateway: cleanGateway });

  const isConfirmed = process.argv.includes("--confirm");

  console.log("=== Pinata Dev Storage Cleanup ===");
  console.log(`Mode: ${isConfirmed ? "EXECUTE (--confirm provided)" : "DRY RUN (count only)"}`);

  try {
    // List all files in account
    const allFiles = await pinata.files.list().all();
    console.log(`Total files in Pinata account: ${allFiles.length} / 500`);

    // Filter Saakshi dev files
    const devFiles = allFiles.filter((f) => {
      const kv = f.keyvalues || {};
      return kv.env === "dev" || (kv.app === "saakshi" && kv.env !== "prod");
    });

    console.log(`Found ${devFiles.length} Saakshi file(s) tagged with env=dev.`);

    if (devFiles.length === 0) {
      console.log("No development files found to clean up.");
      return;
    }

    if (!isConfirmed) {
      console.log("\n[DRY RUN] No files were unpinned.");
      console.log("To permanently unpin these development files, run:");
      console.log("  npm run pinata:cleanup -- --confirm\n");
      return;
    }

    console.log(`\nUnpinning ${devFiles.length} file(s) from Pinata...`);
    const fileIds = devFiles.map((f) => f.id);

    // Delete in batches of 20
    const batchSize = 20;
    let deletedCount = 0;
    for (let i = 0; i < fileIds.length; i += batchSize) {
      const batch = fileIds.slice(i, i + batchSize);
      await pinata.files.delete(batch);
      deletedCount += batch.length;
      console.log(`Deleted batch ${i / batchSize + 1}: ${deletedCount}/${fileIds.length} files`);
    }

    console.log(`\n✅ Successfully unpinned ${deletedCount} development files from Pinata.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Pinata cleanup error:", msg);
    process.exit(1);
  }
}

runPinataCleanup();
