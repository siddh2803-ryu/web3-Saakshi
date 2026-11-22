import * as path from "path";
import * as fs from "fs";
import { chromium } from "playwright-core";

const EVIDENCE_DIR = path.resolve(__dirname, "../docs/evidence");
const PORT = 3009;
const BASE_URL = `http://localhost:${PORT}`;

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function run() {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  console.log("Launching headless browser for screenshots...");
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // 1. Landing Page
  console.log("Capturing 01-landing-hero.png...");
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "01-landing-hero.png"), fullPage: false });

  // 2. New Capture Form
  console.log("Capturing 02-capture-new.png...");
  await page.goto(`${BASE_URL}/capture/new`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "02-capture-new.png"), fullPage: false });

  // 3. Simulated Chirp Sandbox Post
  console.log("Capturing 03-sandbox-post.png...");
  await page.goto(`${BASE_URL}/sandbox/post/internship-scam-alert`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "03-sandbox-post.png"), fullPage: false });

  // 4. Sandbox Admin Controls
  console.log("Capturing 04-sandbox-admin.png...");
  await page.goto(`${BASE_URL}/sandbox/admin`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "04-sandbox-admin.png"), fullPage: false });

  // 5. Public Verifier
  console.log("Capturing 05-verify-tool.png...");
  await page.goto(`${BASE_URL}/verify`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "05-verify-tool.png"), fullPage: false });

  await browser.close();
  console.log("Screenshots captured successfully in docs/evidence/!");
}

run().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
