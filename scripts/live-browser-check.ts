import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from apps/web/.env.local or root .env.local
dotenv.config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Ensure we are in live mode, not fixture mode
process.env.TINYFISH_MODE = "live";

async function runLiveBrowserCheck() {
  console.log("=== TinyFish Browser API Live Verification ===");

  // Dynamically import captureWithBrowserApi
  const { captureWithBrowserApi } = await import("../apps/web/lib/tinyfish/browser");

  const targets = [
    { name: "Example Domain", url: "https://example.com" },
    { name: "Public Wikipedia Article", url: "https://en.wikipedia.org/wiki/Internet" },
  ];

  const results: Array<{
    name: string;
    url: string;
    sessionId?: string;
    finalUrl: string;
    pageTitle: string;
    timingMs: number;
    fullpageScreenshotBytes: number;
    pagePdfBytes: number | null;
    pdfStatus: string;
    domHtmlChars: number;
    networkLogEntriesCount: number;
    tlsProtocol: string | null;
    tlsIssuer: string | null;
    tlsSubject: string | null;
  }> = [];

  for (const target of targets) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Starting Live Browser Capture: ${target.name} (${target.url})`);
    const startTime = Date.now();
    try {
      const res = await captureWithBrowserApi(target.url);
      const elapsed = Date.now() - startTime;

      console.log(`✓ Browser capture succeeded in ${elapsed}ms`);
      console.log(`  Session ID: ${res.sessionId || "unknown"}`);
      console.log(`  Final URL: ${res.finalUrl}`);
      console.log(`  Page Title: ${res.pageTitle}`);
      console.log(`  Fullpage Screenshot: ${res.fullpageScreenshot.length} bytes (PNG)`);
      if (res.pagePdf) {
        console.log(`  Page PDF: ${res.pagePdf.length} bytes`);
      } else {
        console.log(`  Page PDF: null (CDP printToPDF unsupported or logged warning)`);
      }
      console.log(`  DOM HTML: ${res.domHtml.length} characters`);
      console.log(`  Network Log: ${res.networkLog.length} requests logged`);
      if (res.tlsInfo) {
        console.log(`  TLS: ${res.tlsInfo.protocol} | Issuer: ${res.tlsInfo.issuer} | Subject: ${res.tlsInfo.subjectName}`);
      } else {
        console.log(`  TLS Info: null`);
      }

      results.push({
        name: target.name,
        url: target.url,
        sessionId: res.sessionId,
        finalUrl: res.finalUrl,
        pageTitle: res.pageTitle,
        timingMs: elapsed,
        fullpageScreenshotBytes: res.fullpageScreenshot.length,
        pagePdfBytes: res.pagePdf ? res.pagePdf.length : null,
        pdfStatus: res.pagePdf ? "OK" : "WARNING_OR_UNSUPPORTED",
        domHtmlChars: res.domHtml.length,
        networkLogEntriesCount: res.networkLog.length,
        tlsProtocol: res.tlsInfo?.protocol || null,
        tlsIssuer: res.tlsInfo?.issuer || null,
        tlsSubject: res.tlsInfo?.subjectName || null,
      });
    } catch (err: unknown) {
      console.error(`✗ Browser capture failed for ${target.url}:`, err);
      throw err;
    }
  }

  console.log("\n=== Summary Table ===");
  console.log(JSON.stringify(results, null, 2));
}

runLiveBrowserCheck().catch((err) => {
  console.error("Fatal live browser check failure:", err);
  process.exit(1);
});
