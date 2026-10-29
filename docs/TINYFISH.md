# TinyFish Integration Notes & Live Documentation Comparison

This document records the integration details for TinyFish across Saakshi's architecture, matching the live documentation from [TinyFish](https://docs.tinyfish.ai/).

## Summary of TinyFish Products Used in Saakshi

1. **Web Agent (`https://agent.tinyfish.ai/v1/automation/run-async`)**:
   - Asynchronous goal-driven browsing agent.
   - Headers: `X-API-Key: $TINYFISH_API_KEY`, `Content-Type: application/json`.
   - Polling / Status: `GET https://agent.tinyfish.ai/v1/runs/{id}`.
   - Step Screenshots: `GET https://agent.tinyfish.ai/v1/runs/{id}?screenshots=base64`.
   - Live stream: `streaming_url` displayed in sandbox live view.
   - Cancel: `POST https://agent.tinyfish.ai/v1/runs/{id}/cancel`.
   - Note on beta/account-gated fields:
     - `agent_config.max_steps` and `agent_config.mode: "strict"` are gated under beta flags. Handled conditionally via `TINYFISH_AGENT_BETA=true`.
     - `capture_config` (`elements`, `screenshots`, `html`) is account-gated. Handled conditionally via `TINYFISH_CAPTURE_CONFIG=true`.
     - Fallback: rely on `agent_config.max_duration_seconds` and the step budget written into `GOAL_TEMPLATE`.

2. **Browser API (`https://api.browser.tinyfish.ai`)**:
   - Direct CDP managed Chromium sessions.
   - Session creation: `POST https://api.browser.tinyfish.ai` with `{ "timeout_seconds": 120 }` (without `url` so target page does not load before listeners attach; 60s client timeout).
   - Connect via `playwright-core` using `chromium.connectOverCDP(cdp_url)`.
   - Attach `page.on("response")` listeners BEFORE navigating, then `page.goto(target, { waitUntil: "domcontentloaded" })`.
   - Captures: full-page PNG screenshot (`fullPage: true`), PDF render (`printBackground: true`, warning logged if unsupported over CDP), network response log JSON (`url, status, method, resourceType, contentType, timing`), TLS certificate details (`securityDetails()`: `protocol, issuer, subjectName, validFrom, validTo`), DOM outer HTML (`page.content()`).
   - Lifecycle: Session terminated unconditionally via `DELETE https://api.browser.tinyfish.ai/{session_id}` in `finally` block on success, screenshot failure, and navigation failure; logs `browser session <id> terminated`; never logs `cdp_url`.
   - Error handling: HTTP 402 wallet empty -> "capture credits exhausted", HTTP 429 honors `Retry-After`, HTTP 503 retries once after 5s.

3. **Fetch API (`https://api.fetch.tinyfish.ai`)**:
   - Clean, token-efficient markdown extraction (client timeout 150s).
   - Payload: `{ "urls": [url], "format": "markdown", "links": true, "image_links": true, "ttl": 0, "per_url_timeout_ms": 60000, "include_etag_and_last_modified": true }`.
   - Response validated with Zod (`TinyFishFetchResponseSchema`).
   - Artifacts: `fetch_markdown` (`results[0].text`) and `fetch_meta` JSON (`title, description, author, published_date, language, final_url, links, image_links, etag, last_modified, latency_ms`).
   - Error mapping: maps `timeout`, `bot_blocked`, `page_not_found`, `login_required` to capture events and retains codes for Phase 6 deletion detection.
   - Retries: 1 retry on 5xx or network error with 2-second backoff, no retry on 4xx, logs `X-Request-ID`.

4. **Monitor API (`https://agent.tinyfish.ai/v1/monitors`)**:
   - Change detection and deletion alerting.
   - Create: `POST https://agent.tinyfish.ai/v1/monitors` with `type: "fetch"`, cron schedule, webhook URL, and target URL.
   - Run-now: `POST https://agent.tinyfish.ai/v1/monitors/{id}/runs` for instant evaluation during interactive demos (processed inline as run-now doesn't dispatch webhooks).
   - Webhook processing: `POST /api/webhooks/monitor?token=...` handling classification (`NO_CHANGE`, `EDITED`, `DELETED`, `BLOCKED`).

5. **Search API (`https://api.search.tinyfish.ai`)**:
   - Repost and mirror finder.
   - Query: `GET https://api.search.tinyfish.ai?query=<quoted-phrase>&location=IN&language=en` with fallback to `US`.
   - Used in repost discovery flow to identify duplicate or scraped content.

## Discrepancies / Live Docs Alignment

- **Webhook Validation**: TinyFish webhooks do not currently send cryptographic HMAC signatures; as specified in the PRD, we validate incoming webhooks via high-entropy query token (`?token=<WEBHOOK_SECRET>`) and verify the run status directly with `GET /v1/runs/{id}` before taking action.
- **Run Completion vs Success**: Live docs confirm `COMPLETED` signifies that the agent lifecycle ended, not that the target content was legally accessible. Saakshi explicitly inspects `result.blocked`, captchas, and login barriers, transitioning to `PARTIAL` rather than blind success.
- **Live Preview Stream**: `streaming_url` can take 3-5 seconds to initialize and closes upon agent completion. Saakshi UX accounts for this with a loading state and fallback to the step filmstrip once complete.

## Phase 1 Acceptance & Verification Status

| Criterion (PRD Section 17) | Status | Verification Method | Action to Turn PASS |
|---|---|---|---|
| **(a) Capturing deployed sandbox post shows live preview, completes, lists >= 5 step screenshots with actions** | **PASS** | `LIVE (Run b2bbaef6-0203-410f-8122-49adc8c7f67b)` | Verified live against Cloudflare tunneled sandbox endpoint. Recorded 6 steps with base64 screenshots and live streaming preview. |
| **(b) Agent result matches output schema in Section 7.1** | **PASS** | `LOCAL (Vitest + Zod)` | Validated with Zod schemas in `apps/web/lib/tinyfish/schemas.ts`. |
| **(c) Blocked-result detection is unit-tested** | **PASS** | `LOCAL (Vitest)` | Tested across `blocked=true`, captcha, access denied, login required in `apps/web/tests/agent.test.ts`. |

## Phase 2 Acceptance & Verification Status (Day 1 of 2)

| Criterion (PRD Section 17) | Status | Verification Method | Action to Turn PASS |
|---|---|---|---|
| **(a) Each capture has `fullpage_screenshot`, `page_pdf` (or logged warning), `network_log`, `tls_info`, `dom_html`, `fetch_markdown`, and `fetch_meta`** | **PARTIAL** | `LIVE (Fetch) + UNIT (Browser)` | Fetch verified live against `https://example.com` (156 chars, 2089ms) and Wikipedia `https://en.wikipedia.org/wiki/Internet` (97,640 chars, 9009ms). Browser artifacts unit tested in `apps/web/tests/browser.test.ts`. Day 2 will verify live Browser API CDP capture. |
| **(b) Logs show every browser session terminated** | **PASS** | `UNIT (Vitest)` | Verified termination calls `DELETE https://api.browser.tinyfish.ai/{session_id}` on success, screenshot error, and navigation error; logs `browser session <id> terminated`; never prints `cdp_url`. Day 2 will verify live in production logs. |

### Live Fetch Check Results
- Target 1: `https://example.com` (Title: `Example Domain`, Length: 156 chars, Latency: 2,089 ms, Errors: 0, Request ID: `d9a0b680-9386-4c86-b4f4-e229ff48f2b9`)
- Target 2: `https://en.wikipedia.org/wiki/Internet` (Title: `Internet - Wikipedia`, Length: 97,640 chars, Latency: 9,009 ms, Links: 2,384, Images: 88, Errors: 0, Request ID: `9991e6f7-6e56-42a4-8520-f17308032f16`)

### How to Record Live Fixtures (`scripts/record-fixture.ts`)
```bash
# 1. Add your real TinyFish key to .env.local:
# TINYFISH_API_KEY=tf_live_...

# 2. Record an existing run by run_id:
npx ts-node -r tsconfig-paths/register scripts/record-fixture.ts run_abc12345

# 3. Or initiate a live run directly:
npx ts-node -r tsconfig-paths/register scripts/record-fixture.ts https://your-domain.vercel.app/sandbox/post/internship-scam-alert
```
