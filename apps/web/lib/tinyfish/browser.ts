import { isFixtureMode, tinyFishFetch } from "./client";
import { FIXTURE_BROWSER_CAPTURE } from "./fixtures";

export interface NetworkLogEntry {
  url: string;
  status: number;
  method: string;
  resourceType: string;
  contentType: string;
  timing?: number;
}

export interface TlsSecurityDetails {
  protocol: string;
  issuer: string;
  subject: string;
  validFrom: number;
  validTo: number;
}

export interface BrowserCaptureResult {
  fullpageScreenshot: Buffer;
  pagePdf: Buffer | null;
  domHtml: string;
  networkLog: NetworkLogEntry[];
  tlsInfo: TlsSecurityDetails | null;
  finalUrl: string;
  pageTitle: string;
}

interface CreateSessionResponse {
  session_id: string;
  cdp_url: string;
  base_url: string;
}

/**
 * Executes a full-fidelity browser capture session through TinyFish Browser API over CDP.
 * Guaranteed session termination in finally block.
 */
export async function captureWithBrowserApi(targetUrl: string): Promise<BrowserCaptureResult> {
  if (isFixtureMode()) {
    return FIXTURE_BROWSER_CAPTURE;
  }

  let sessionId: string | null = null;

  try {
    // 1. Create browser session
    const session = await tinyFishFetch<CreateSessionResponse>(
      "https://api.browser.tinyfish.ai",
      {
        method: "POST",
        body: { url: targetUrl, timeout_seconds: 120 },
        timeoutMs: 60000,
      }
    );

    sessionId = session.session_id;
    const cdpUrl = session.cdp_url;

    // 2. Dynamically import playwright-core
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connectOverCDP(cdpUrl);

    try {
      const context = browser.contexts()[0] || (await browser.newContext());
      const page = context.pages()[0] || (await context.newPage());

      const networkEntries: NetworkLogEntry[] = [];
      let tlsInfo: TlsSecurityDetails | null = null;

      // Listen for network events
      page.on("response", async (response) => {
        try {
          const req = response.request();
          networkEntries.push({
            url: response.url(),
            status: response.status(),
            method: req.method(),
            resourceType: req.resourceType(),
            contentType: response.headers()["content-type"] || "unknown",
          });

          // Grab TLS details from the main navigation response if available
          if (!tlsInfo && req.isNavigationRequest()) {
            const sec = await response.securityDetails();
            if (sec) {
              const anySec = sec as {
                protocol?: string | (() => string);
                issuer?: string | (() => string);
                subjectName?: string | (() => string);
                validFrom?: number | (() => number);
                validTo?: number | (() => number);
              };
              tlsInfo = {
                protocol:
                  typeof anySec.protocol === "function"
                    ? anySec.protocol()
                    : anySec.protocol || "TLS 1.3",
                issuer:
                  typeof anySec.issuer === "function"
                    ? anySec.issuer()
                    : anySec.issuer || "Unknown",
                subject:
                  typeof anySec.subjectName === "function"
                    ? anySec.subjectName()
                    : anySec.subjectName || "Unknown",
                validFrom:
                  typeof anySec.validFrom === "function"
                    ? anySec.validFrom()
                    : anySec.validFrom || 0,
                validTo:
                  typeof anySec.validTo === "function"
                    ? anySec.validTo()
                    : anySec.validTo || 0,
              };
            }
          }
        } catch {
          // Ignore individual response inspection failures
        }
      });

      // Navigate and wait for network idle (capped at 20s)
      await page.goto(targetUrl, { timeout: 30000, waitUntil: "domcontentloaded" });
      try {
        await page.waitForLoadState("networkidle", { timeout: 20000 });
      } catch {
        console.warn("networkidle timed out after 20s, proceeding with available DOM");
      }

      // Scroll viewport in steps to trigger lazy loading
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight || totalHeight > 3000) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      const finalUrl = page.url();
      const pageTitle = await page.title();
      const domHtml = await page.evaluate(() => document.documentElement.outerHTML);

      // Screenshot full page
      const screenshotUint8 = await page.screenshot({ fullPage: true, type: "png" });
      const fullpageScreenshot = Buffer.from(screenshotUint8);

      // Render PDF (skip gracefully if CDP does not support PDF on this page)
      let pagePdf: Buffer | null = null;
      try {
        const pdfUint8 = await page.pdf({ printBackground: true });
        pagePdf = Buffer.from(pdfUint8);
      } catch (pdfErr) {
        console.warn("page.pdf threw over CDP, proceeding without PDF artifact:", pdfErr);
      }

      return {
        fullpageScreenshot,
        pagePdf,
        domHtml,
        networkLog: networkEntries,
        tlsInfo,
        finalUrl,
        pageTitle,
      };
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    // Guaranteed session termination
    if (sessionId) {
      try {
        await tinyFishFetch(`https://api.browser.tinyfish.ai/${sessionId}`, {
          method: "DELETE",
        });
      } catch (termErr) {
        console.warn(`Failed to terminate browser session ${sessionId}:`, termErr);
      }
    }
  }
}
