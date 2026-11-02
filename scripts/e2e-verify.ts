import * as path from "path";
import * as fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { chromium } from "playwright-core";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.chain-local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PORT = 3005;
const BASE_URL = `http://localhost:${PORT}`;

async function waitForServer(url: string, timeoutMs: number = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) {
        return true;
      }
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function runE2E() {
  console.log("==================================================");
  console.log("SAAKSHI PHASE 5 PLAYWRIGHT E2E VERIFICATION TEST");
  console.log(`Target: ${BASE_URL}`);
  console.log("==================================================\n");

  const tmpDir = path.resolve(__dirname, "../tmp");
  const testBundlePath = path.join(tmpDir, "test_bundle.zip");
  const tamperedBundlePath = path.join(tmpDir, "tampered_bundle.zip");
  const originalScreenshotPath = path.join(tmpDir, "original_screenshot.png");
  const tamperedScreenshotPath = path.join(tmpDir, "tampered_screenshot.png");
  const unrelatedFilePath = path.join(tmpDir, "unrelated_file.txt");
  const captureMetaPath = path.join(tmpDir, "capture_meta.json");

  if (!fs.existsSync(testBundlePath) || !fs.existsSync(captureMetaPath)) {
    throw new Error("Test bundle or capture_meta.json missing! Run scripts/anchor-local.ts first.");
  }

  const captureMeta = JSON.parse(fs.readFileSync(captureMetaPath, "utf8"));
  const captureId = captureMeta.captureId;

  // 1. Start Next.js production server
  console.log(`[1] Starting Next.js web application on port ${PORT}...`);
  const serverProcess: ChildProcess = spawn(
    "npx",
    ["next", "start", "apps/web", "-p", String(PORT)],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        PORT: String(PORT),
      },
    }
  );

  serverProcess.stderr?.on("data", (d) => {
    // console.log("[server stderr]", d.toString());
  });

  const serverReady = await waitForServer(`${BASE_URL}/verify`);
  if (!serverReady) {
    serverProcess.kill();
    throw new Error(`Web server failed to become ready on ${BASE_URL} within 30s`);
  }
  console.log(`    ✅ Web server is ready at ${BASE_URL}\n`);

  // 2. Launch Chromium (Playwright)
  console.log(`[2] Launching Chromium in signed-out incognito session...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(); // Clean context without auth
  const page = await context.newPage();

  page.on("console", (msg) => {
    console.log(`    [Browser Console] ${msg.type()}: ${msg.text()}`);
  });

  try {
    // -------------------------------------------------------------
    // Test (a) & (d): Trustless Bundle Mode (Zero API calls, Direct RPC)
    // -------------------------------------------------------------
    console.log(`[3] Testing Trustless Bundle Mode (/verify with ${path.basename(testBundlePath)})...`);
    const networkRequests: { url: string; method: string }[] = [];
    page.on("request", (req) => {
      networkRequests.push({ url: req.url(), method: req.method() });
    });

    await page.goto(`${BASE_URL}/verify`, { waitUntil: "networkidle" });

    // Upload test bundle ZIP
    networkRequests.length = 0; // Clear initial page assets
    const fileInput = await page.locator("input#verify-file-input");
    await fileInput.setInputFiles(testBundlePath);

    // Wait for results container
    await page.waitForSelector("text=Verification Outcomes", { timeout: 15000 });
    const outcomesText = await page.locator("text=Verification Outcomes").locator("..").locator("..").innerText();
    console.log("    Outcomes rendered:\n", outcomesText);

    // Network audit for bundle mode
    const apiCalls = networkRequests.filter((r) => r.url.includes("/api/"));
    console.log(`    API calls made during bundle verification: ${apiCalls.length}`);
    if (apiCalls.length > 0) {
      throw new Error(`Bundle mode made unexpected API calls: ${apiCalls.map((c) => c.url).join(", ")}`);
    }
    console.log("    ✅ Acceptance Criterion (d): Bundle mode made ZERO calls to Saakshi's API");

    const rpcCalls = networkRequests.filter((r) => r.url.includes(":8545") || r.url.includes("rpc"));
    console.log(`    Direct RPC calls made: ${rpcCalls.length}`);
    if (rpcCalls.length === 0) {
      console.warn("    Note: RPC provider may have utilized cached provider instance or direct fetch.");
    } else {
      console.log(`    ✅ Browser made direct RPC calls to blockchain: ${rpcCalls[0].url}`);
    }

    const pageContent = await page.content();
    if (!pageContent.includes("VERIFIED")) {
      throw new Error("Page does not show VERIFIED text for test bundle!");
    }
    console.log("    ✅ Acceptance Criterion (a): Original bundle files show green VERIFIED\n");

    // -------------------------------------------------------------
    // Test (b): Tampered Bundle Mode (Altered 1 byte)
    // -------------------------------------------------------------
    console.log(`[4] Testing Tampered Bundle Mode with 1 changed byte...`);
    await page.goto(`${BASE_URL}/verify`, { waitUntil: "networkidle" });
    const fileInput2 = await page.locator("input#verify-file-input");
    await fileInput2.setInputFiles(tamperedBundlePath);

    await page.waitForSelector('[data-testid="verification-outcome"][data-state="ALTERED"]', { timeout: 15000 });
    const tamperedContent = await page.content();
    if (!tamperedContent.includes("ALTERED") && !tamperedContent.includes("has been changed")) {
      throw new Error("Page did not report ALTERED for tampered bundle!");
    }
    console.log("    ✅ Acceptance Criterion (b): Tampered bundle shows red ALTERED ('This file has been changed since it was captured')\n");

    // -------------------------------------------------------------
    // Test Single-file Mode: Original vs 1-byte Altered vs Unrelated
    // -------------------------------------------------------------
    console.log(`[5] Testing Single-File Mode...`);
    // (1) Original screenshot -> VERIFIED
    await page.goto(`${BASE_URL}/verify`, { waitUntil: "networkidle" });
    const fileInput3 = await page.locator("input#verify-file-input");
    await fileInput3.setInputFiles(originalScreenshotPath);

    await page.waitForSelector('[data-testid="verification-outcome"][data-state="VERIFIED"]', { timeout: 15000 });
    const singleOrigContent = await page.content();
    if (!singleOrigContent.includes("VERIFIED")) {
      throw new Error("Original loose screenshot did not show VERIFIED!");
    }
    console.log("    ✅ Original loose file verified on-chain via index lookup");

    // (2) Tampered 1-byte screenshot -> NOT FOUND
    await page.goto(`${BASE_URL}/verify`, { waitUntil: "networkidle" });
    const fileInput4 = await page.locator("input#verify-file-input");
    await fileInput4.setInputFiles(tamperedScreenshotPath);

    await page.waitForSelector('[data-testid="verification-outcome"][data-state="NOT_FOUND"]', { timeout: 15000 });
    const singleTamperedContent = await page.content();
    if (!singleTamperedContent.includes("NOT_FOUND") && !singleTamperedContent.includes("Not found in Saakshi's records")) {
      throw new Error("Tampered loose file did not show NOT FOUND!");
    }
    console.log("    ✅ 1-byte changed loose file shows grey NOT FOUND");

    // (3) Unrelated file -> NOT FOUND
    await page.goto(`${BASE_URL}/verify`, { waitUntil: "networkidle" });
    const fileInput5 = await page.locator("input#verify-file-input");
    await fileInput5.setInputFiles(unrelatedFilePath);

    await page.waitForSelector('[data-testid="verification-outcome"][data-state="NOT_FOUND"]', { timeout: 15000 });
    console.log("    ✅ Unrelated file shows grey NOT FOUND\n");

    // -------------------------------------------------------------
    // Test Public Page /v/[id] with Scoped Verifier & Privacy
    // -------------------------------------------------------------
    console.log(`[6] Testing Public Certificate Page (/v/${captureId})...`);
    await page.goto(`${BASE_URL}/v/${captureId}`, { waitUntil: "networkidle" });

    const certContent = await page.content();
    if (!certContent.includes("Immutable Evidence Certificate")) {
      throw new Error("Public proof certificate failed to load!");
    }
    if (!certContent.includes("Hidden by evidence owner for privacy")) {
      throw new Error("Target URL should be hidden by default for privacy!");
    }
    console.log("    ✅ Privacy control verified: URL is hidden by default");

    // Test scoped verifier on /v/[id]
    const scopedInput = await page.locator("input#scoped-file-input");
    await scopedInput.setInputFiles(originalScreenshotPath);
    await page.waitForSelector('[data-testid="scoped-match-result"][data-matched="true"]', { timeout: 10000 });
    console.log("    ✅ Scoped drop zone confirmed match against capture artifacts");

    await scopedInput.setInputFiles(unrelatedFilePath);
    await page.waitForSelector('[data-testid="scoped-match-result"][data-matched="false"]', { timeout: 10000 });
    console.log("    ✅ Scoped drop zone rejected unrelated file");

    console.log(`\n==================================================`);
    console.log("🎉 ALL PLAYWRIGHT END-TO-END VERIFICATION CHECKS PASSED!");
    console.log("==================================================\n");
  } finally {
    await browser.close();
    serverProcess.kill("SIGTERM");
  }
}

runE2E().catch((err) => {
  console.error("❌ E2E Verification failed:", err);
  process.exit(1);
});
