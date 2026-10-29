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
    // 1. Create browser session without url (60s client timeout)
    const session = await createBrowserSession();
    sessionId = session.session_id;

    // 2. Connect with playwright-core over CDP (NEVER log session.cdp_url)
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connectOverCDP(session.cdp_url);

    try {
      const context = browser.contexts()[0] || (await browser.newContext());
      const page = context.pages()[0] || (await context.newPage());

      await page.goto(targetUrl, { timeout: 30000, waitUntil: "domcontentloaded" });

      const finalUrl = page.url();
      const pageTitle = await page.title();
      const domHtml = await page.content();
      const screenshotUint8 = await page.screenshot({ fullPage: true, type: "png" });

      return {
        sessionId,
        fullpageScreenshot: Buffer.from(screenshotUint8),
        pagePdf: null,
        domHtml,
        networkLog: [],
        tlsInfo: null,
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
        console.log(`browser session ${sessionId} terminated`);
      } catch (termErr) {
        console.warn(`Failed to terminate browser session ${sessionId}:`, termErr);
      }
    }
  }
}
