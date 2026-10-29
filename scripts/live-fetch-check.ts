import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from apps/web/.env.local or root .env.local
dotenv.config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Ensure we are in live mode, not fixture mode
process.env.TINYFISH_MODE = "live";

async function runLiveCheck() {
  console.log("=== TinyFish Fetch API Live Verification ===");

  // Dynamically import fetchCleanText to ensure env vars are applied
  const { fetchCleanText } = await import("../apps/web/lib/tinyfish/fetch");

  const targets = [
    { name: "Example Domain", url: "https://example.com" },
    { name: "Public Wikipedia Article", url: "https://en.wikipedia.org/wiki/Internet" },
  ];

  const results: Array<{
    name: string;
    url: string;
    title: string | null;
    final_url: string | null;
    text_length: number;
    latency_ms: number;
    errors: unknown[];
  }> = [];

  for (const target of targets) {
    console.log(`\nFetching: ${target.name} (${target.url})...`);
    try {
      const res = await fetchCleanText(target.url);
      console.log(`✓ Fetched successfully in ${res.latencyMs}ms`);
      console.log(`  Title: ${res.meta.title || res.title || "(no title)"}`);
      console.log(`  Final URL: ${res.meta.final_url || res.finalUrl || target.url}`);
      console.log(`  Text length: ${res.text.length} characters`);
      console.log(`  Links found: ${res.meta.links?.length ?? 0}, Image links: ${res.meta.image_links?.length ?? 0}`);
      console.log(`  Errors: ${JSON.stringify(res.errors)}`);
      if (res.meta.etag) console.log(`  ETag: ${res.meta.etag}`);
      if (res.meta.last_modified) console.log(`  Last-Modified: ${res.meta.last_modified}`);

      results.push({
        name: target.name,
        url: target.url,
        title: res.meta.title || null,
        final_url: res.meta.final_url || null,
        text_length: res.text.length,
        latency_ms: res.latencyMs,
        errors: res.errors,
      });
    } catch (err: unknown) {
      console.error(`✗ Fetch failed for ${target.url}:`, err);
      results.push({
        name: target.name,
        url: target.url,
        title: null,
        final_url: null,
        text_length: 0,
        latency_ms: 0,
        errors: [{ message: err instanceof Error ? err.message : String(err) }],
      });
    }
  }

  console.log("\n=== Summary Table ===");
  console.log(JSON.stringify(results, null, 2));
}

runLiveCheck().catch((err) => {
  console.error("Fatal live check failure:", err);
  process.exit(1);
});
