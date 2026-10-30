import { isFixtureMode, tinyFishFetch } from "./client";
import { FIXTURE_BROWSER_CAPTURE } from "./fixtures";
import {
  CreateBrowserSessionResponse,
  CreateBrowserSessionResponseSchema,
  NetworkLogEntry,
  TlsSecurityDetails,
} from "./schemas";

export type { NetworkLogEntry, TlsSecurityDetails };

export interface BrowserCaptureResult {
  sessionId?: string;
  fullpageScreenshot: Buffer;
  pagePdf: Buffer | null;
  domHtml: string;
  networkLog: NetworkLogEntry[];
  tlsInfo: TlsSecurityDetails | null;
  finalUrl: string;
  pageTitle: string;
}

/**
 * Creates a remote browser session via TinyFish Browser API (PRD Section 7.2).
 * Created WITHOUT a url so that the page has not loaded yet when connecting.
 * Client timeout 60 seconds.
 */
export async function createBrowserSession(options: { timeoutSeconds?: number; retryDelayMs?: number } = {}): Promise<CreateBrowserSessionResponse> {
  const timeoutSeconds = options.timeoutSeconds ?? 120;

  const raw = await tinyFishFetch<unknown>(
    "https://api.browser.tinyfish.ai",
    {
      method: "POST",
      // Important: Session created without url so target page has not loaded yet
      body: { timeout_seconds: timeoutSeconds },
      timeoutMs: 60000, // 60-second client timeout per PRD Section 7.2
      retries: 1,
      retryDelayMs: options.retryDelayMs,
      retryOnRateLimit: true,
    }
  );

  return CreateBrowserSessionResponseSchema.parse(raw);
}

/**
 * Terminates an active browser session on TinyFish Browser API (PRD Section 7.2).
 */
export async function terminateBrowserSession(sessionId: string): Promise<void> {
  await tinyFishFetch(`https://api.browser.tinyfish.ai/${sessionId}`, {
    method: "DELETE",
    retries: 1,
  });
  console.log(`browser session ${sessionId} terminated`);
}

/**
 * Executes a full-fidelity browser capture session through TinyFish Browser API over CDP.
 *
 * Flow per PRD Section 7.2 & Phase 2:
 * 1. Create session without url (timeout_seconds: 120, 60s client timeout).
 * 2. Connect with playwright-core chromium.connectOverCDP(cdp_url) and use existing context & page.
 * 3. Attach page.on("response") listeners BEFORE navigating.
 * 4. page.goto(target, waitUntil: "domcontentloaded"), wait for networkidle capped at 20s, scroll down.
 * 5. Capture artifacts: fullpage_screenshot (PNG), page_pdf (or warning), network_log JSON, tls_info JSON, dom_html (page.content()).
 * 6. Always terminate session in finally block; log "browser session <id> terminated". Never log cdp_url.
 */
export async function captureWithBrowserApi(targetUrl: string): Promise<BrowserCaptureResult> {
  if (isFixtureMode()) {
    return FIXTURE_BROWSER_CAPTURE;
  }

  let sessionId: string | null = null;

  try {
    // 1. Create browser session without url (60s client timeout)
    const session = await createBrowserSession();
    sessionId = session.session_id;

    // 2. Connect with playwright-core over CDP (NEVER log session.cdp_url)
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connectOverCDP(session.cdp_url);

    try {
      // Use existing context and page
      const context = browser.contexts()[0] || (await browser.newContext());
      const page = context.pages()[0] || (await context.newPage());

      const networkEntries: NetworkLogEntry[] = [];
      let tlsInfo: TlsSecurityDetails | null = null;
      const navStartTime = Date.now();

      // 3. Attach page.on("response") listeners BEFORE navigating
      page.on("response", async (response) => {
        try {
          const req = response.request();
          let timingMs: number | undefined;
          try {
            const timingObj = req.timing();
            if (timingObj && typeof timingObj.responseEnd === "number" && timingObj.responseEnd > 0) {
              timingMs = Math.round(timingObj.responseEnd);
            } else {
              timingMs = Date.now() - navStartTime;
            }
          } catch {
            timingMs = Date.now() - navStartTime;
          }

          networkEntries.push({
            url: response.url(),
            status: response.status(),
            method: req.method(),
            resourceType: req.resourceType(),
            contentType: response.headers()["content-type"] || "unknown",
            timing: timingMs,
          });

          // Grab TLS details from the main navigation response if available
          if (!tlsInfo && req.isNavigationRequest()) {
            const sec = await response.securityDetails();
            if (sec) {
              const anySec = sec as Record<string, unknown>;
              const getVal = (key: string, fallback: unknown) => {
                const val = anySec[key];
                return typeof val === "function" ? val() : (val ?? fallback);
              };

              const protocol = String(getVal("protocol", "TLS 1.3"));
              const issuer = String(getVal("issuer", "Unknown"));
              const subjectName = String(getVal("subjectName", getVal("subject", "Unknown")));
              const validFrom = Number(getVal("validFrom", 0));
              const validTo = Number(getVal("validTo", 0));

              tlsInfo = {
                protocol,
                issuer,
                subjectName,
                subject: subjectName,
                validFrom,
                validTo,
              };
            }
          }
        } catch {
          // Ignore individual response inspection failures
        }
      });

      // 4. Navigate with waitUntil "domcontentloaded"
      await page.goto(targetUrl, { timeout: 30000, waitUntil: "domcontentloaded" });

      // Wait for networkidle capped at 20 seconds
      try {
        await page.waitForLoadState("networkidle", { timeout: 20000 });
      } catch {
        console.warn("networkidle timed out after 20s, proceeding with available DOM");
      }

      // Scroll to the bottom in steps to trigger lazy loading
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            const scrollHeight = document.body ? document.body.scrollHeight : 0;
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
      const domHtml = await page.content();

      // Screenshot full page (PNG, fullPage true)
      let screenshotUint8: Uint8Array;
      try {
        screenshotUint8 = await page.screenshot({ fullPage: true, type: "png", timeout: 60000 });
      } catch (shotErr) {
        console.warn("fullpage screenshot failed or timed out, falling back to viewport screenshot:", shotErr);
        screenshotUint8 = await page.screenshot({ fullPage: false, type: "png", timeout: 30000 });
      }
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
        sessionId,
        fullpageScreenshot,
        pagePdf,
        domHtml,
        networkLog: networkEntries,
        tlsInfo,
        finalUrl,
        pageTitle,
      };
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  } finally {
    // Guaranteed session termination per PRD Section 7.2
    if (sessionId) {
      try {
        await terminateBrowserSession(sessionId);
      } catch (termErr) {
        console.warn(`Failed to terminate browser session ${sessionId}:`, termErr);
      }
    }
  }
}
