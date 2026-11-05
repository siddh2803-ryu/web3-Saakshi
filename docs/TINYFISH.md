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

## Phase 2 Acceptance & Verification Status

| Criterion (PRD Section 17) | Status | Verification Method | Live Evidence / Details |
|---|---|---|---|
| **(a) Each capture has `fullpage_screenshot`, `page_pdf` (or logged warning), `network_log`, `tls_info`, `dom_html`, `fetch_markdown`, and `fetch_meta`** | **PASS** | `LIVE + UNIT` | Live end-to-end capture `cap_mvvaatlb_q8q77` produced all 7 artifacts: `fullpage_screenshot` (345,427 bytes), `page_pdf` (662,629 bytes), `network_log` (5,766 bytes), `tls_info` (170 bytes), `dom_html` (39,557 bytes), `fetch_markdown` (1,130 bytes), and `fetch_meta` (1,333 bytes). Standalone browser checks verified on `example.com` and Wikipedia. |
| **(b) Logs show every browser session terminated** | **PASS** | `LIVE + UNIT` | Verified guaranteed termination via `DELETE https://api.browser.tinyfish.ai/{session_id}` in `finally` block: `browser session tf-61e9036e-3508-4910-860a-a242a39ec9bd terminated` (full capture), `browser session tf-345e7e69-54c2-4669-930a-97cbf3050077 terminated` (example.com), `browser session tf-461e588a-dff3-4643-9561-0c738f19ced6 terminated` (wikipedia.org). Sensitive `cdp_url` never printed. |

### Live Browser & Fetch Check Results
- **Live Standalone Browser Check (`scripts/live-browser-check.ts`):**
  - `https://example.com`: Screenshot 54,433 bytes (PNG), PDF 35,099 bytes, DOM 1,989 chars, 2 network log entries, TLS `TLS 1.3 | Cloudflare TLS Issuing ECC CA 3 | example.com`, duration 17,557ms. Log: `browser session tf-345e7e69-54c2-4669-930a-97cbf3050077 terminated`.
  - `https://en.wikipedia.org/wiki/Internet`: Screenshot 173,376 bytes (PNG), PDF 833,987 bytes, DOM 1,427,565 chars, 86 network log entries, TLS `TLS 1.3 | YE2 | *.wikipedia.org`, duration 85,012ms. Log: `browser session tf-461e588a-dff3-4643-9561-0c738f19ced6 terminated`.
- **Live End-to-End Capture (`scripts/live-full-capture.ts`):**
  - Capture ID: `cap_mvvaatlb_q8q77`
  - Target URL: `https://camps-tobacco-long-auburn.trycloudflare.com/sandbox/post/internship-scam-alert`
  - Agent Run: `70f5d1bc-78ce-4947-ba97-c3f618031f0b` (Completed with live stream & steps)
  - Final State: `READY`
  - All 10 artifacts sealed with SHA-256 and previewable via `/api/captures/:id/artifacts/:artifactId`.
  - Log: `browser session tf-61e9036e-3508-4910-860a-a242a39ec9bd terminated`.
- **Live Fetch Check (`scripts/live-fetch-check.ts`):**
  - Target 1: `https://example.com` (Title: `Example Domain`, Length: 156 chars, Latency: 2,089 ms, Errors: 0, Request ID: `d9a0b680-9386-4c86-b4f4-e229ff48f2b9`)
  - Target 2: `https://en.wikipedia.org/wiki/Internet` (Title: `Internet - Wikipedia`, Length: 97,640 chars, Latency: 9,009 ms, Links: 2,384, Images: 88, Errors: 0, Request ID: `9991e6f7-6e56-42a4-8520-f17308032f16`)

## Phase 6 Acceptance & Verification Status (Part 1 of 3)

| Criterion (PRD Section 17) | Status | Verification Method | Live Evidence / Details |
|---|---|---|---|
| **(a) Create TinyFish Page Monitor with hourly cron & purpose** | **PASS** | `LIVE + UNIT` | Monitor creation verified live against OpenAPI 3.0 spec endpoint `POST https://agent.tinyfish.ai/v1/monitors`. Created monitor `4625aec3-55e9-4135-91ca-1406957d073f` on `https://example.com` returning baseline run `57947c7b-d359-4d3e-8955-4cdadcf3bb9a`. Validated with Zod schema. |
| **(b) Store baseline contentHash from monitor creation run** | **PASS** | `LIVE + UNIT` | Baseline run parsed from creation response; baseline hash `0a080719be9fbb82a86a45b80dc8c2a430fbe17dc93d23758debac092864d00f` computed on normalized text (Unicode NFC, volatile tokens stripped) and retained for subsequent comparisons. |
| **(c) "Check now" calls Monitor run-now and processes inline** | **PASS** | `LIVE + UNIT` | Verified live: two consecutive `POST https://agent.tinyfish.ai/v1/monitors/{id}/runs` calls (`2dfad43c-b3fb-472c-85f4-18f1909cb57e` and `ffbd0630-e228-4414-9fe3-acc9306e66a8`) returned `HTTP 201` inline. Both classified as `NO_CHANGE` with identical content hash. |
| **(d) Scheduled webhooks at `/api/webhooks/monitor?token=...`** | **PENDING** | `UNIT + LOCAL` | Webhook route handler `apps/web/app/api/webhooks/monitor/route.ts` validated with query token authentication, parsing scheduled run results/errors, and recording watch events. Live end-to-end receipt from TinyFish scheduler pending public domain/tunnel deployment in Part 2. |
| **(e) On EDITED/DELETED: line diff, auto re-capture, in-app alert** | **PENDING** | `UNIT + LOCAL` | Classifier, 20 KB capped unified line diff, and word-level change tokens verified with 16 comprehensive unit tests. Full end-to-end live re-capture execution on altered Chirp post pending Part 2. |
| **(f) Watch timeline with type, time, diff, and re-capture link** | **PENDING** | `UNIT + LOCAL` | Watch timeline UI component in `apps/web/app/capture/[id]/page.tsx` renders check events, diffs, and links. Live multi-event timeline drilldown pending Part 3. |

### Live Monitor Verification Results (`scripts/live-monitor-check.ts`)
- **Target URL:** `https://example.com`
- **Schedule:** Daily (`0 0 * * *`)
- **Created Monitor ID:** `4625aec3-55e9-4135-91ca-1406957d073f`
  - Name: `saakshi-check_1793902124818`
  - Status: `active`
  - HTTP Status: `201 Created` (Request ID: `fdd1b97a-5f48-483a-89c8-c8d4a5259da0`)
  - Baseline Run ID: `57947c7b-d359-4d3e-8955-4cdadcf3bb9a` (`is_baseline: true`)
  - Baseline Hash: `0a080719be9fbb82a86a45b80dc8c2a430fbe17dc93d23758debac092864d00f`
  - Baseline Text Length: 156 characters
- **Check #1 (runNow):**
  - Run ID: `2dfad43c-b3fb-472c-85f4-18f1909cb57e` (`HTTP 201`, Request ID: `d822a663-d090-4e57-92e6-01335fc83a7e`)
  - Results: 1 | Errors: 0
  - Classification: `NO_CHANGE` (Reason: `Content hash strictly matches baseline (volatile counters/timestamps stripped)`)
- **Check #2 (runNow):**
  - Run ID: `ffbd0630-e228-4414-9fe3-acc9306e66a8` (`HTTP 201`, Request ID: `44ef9543-a86e-41d9-90ab-b64d0fdf46cf`)
  - Results: 1 | Errors: 0
  - Classification: `NO_CHANGE` (Reason: `Content hash strictly matches baseline (volatile counters/timestamps stripped)`)
- **Consistent Hash Across Runs:** `true` (`0a080719be9fbb82a86a45b80dc8c2a430fbe17dc93d23758debac092864d00f`)
- **Monitor Cleanup & Deletion:**
  - `DELETE https://agent.tinyfish.ai/v1/monitors/4625aec3-55e9-4135-91ca-1406957d073f` (`HTTP 200`, Request ID: `0cfc1dad-129b-4091-9515-af7a61e090aa`)
  - Response: `{ deleted: true, id: "4625aec3-55e9-4135-91ca-1406957d073f" }`
  - Account Cleanup: `npm run monitor:cleanup` confirmed 0 active `saakshi-*` monitors remaining.

### How to Record Live Fixtures (`scripts/record-fixture.ts`)
```bash
# 1. Add your real TinyFish key to .env.local:
# TINYFISH_API_KEY=tf_live_...

# 2. Record an existing run by run_id:
npx ts-node -r tsconfig-paths/register scripts/record-fixture.ts run_abc12345

# 3. Or initiate a live run directly:
npx ts-node -r tsconfig-paths/register scripts/record-fixture.ts https://your-domain.vercel.app/sandbox/post/internship-scam-alert
```
