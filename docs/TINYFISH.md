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

## Phase 6 Acceptance & Verification Status (COMPLETE)

| Criterion (PRD Section 17) | Status | Verification Method | Live Evidence / Details |
|---|---|---|---|
| **(a) Create TinyFish Page Monitor with hourly cron & purpose** | **PASS** | `LIVE + UNIT` | Monitor creation verified live against OpenAPI 3.0 spec endpoint `POST https://agent.tinyfish.ai/v1/monitors`. Tested on `https://example.com` and live Chirp sandbox post. Validated with Zod schema. |
| **(b) Store baseline contentHash from monitor creation run** | **PASS** | `LIVE + UNIT` | Baseline run parsed from creation response; baseline hash computed on normalized text (Unicode NFC, volatile tokens stripped) and retained for subsequent comparisons. |
| **(c) "Check now" calls Monitor run-now and processes inline** | **PASS** | `LIVE + UNIT` | Verified live on live Chirp sandbox post: "Check now" called `runMonitorNow` returning inline in 2,129ms; classified as `NO_CHANGE` with identical content hash. |
| **(d) Scheduled webhooks at `/api/webhooks/monitor?token=...`** | **PASS** | `LIVE + UNIT` | Verified live via public Cloudflare tunnel: scheduled webhook `38386c5f-ddad-427b-9c37-bcdbd4b325c7` arrived from TinyFish scheduler on 1-minute cron, authenticated via query token, deduplicated, and processed as `NO_CHANGE`. |
| **(e) On EDITED/DELETED: line diff, auto re-capture, in-app alert** | **PASS** | `LIVE + UNIT` | Verified live on live Chirp sandbox post: (1) Post edit detected via scheduled webhook and confirmed via `runNow` (`4ef14de6-8ebd-4e29-b726-db89241ed95f`); unified diff generated; auto re-capture `cap_re_af942c705409feda9422c53c53f16061` initiated; (2) Post deletion detected in 6,414ms (< 60s) as `DELETED`, auto re-capture `cap_re_18e49dea3f2b8060287cf5b050ee66fe` initiated, and in-app alert banners displayed. |
| **(f) Watch timeline with type, time, diff, and re-capture link** | **PASS** | `LIVE + UNIT` | Watch timeline UI component in `apps/web/app/capture/[id]/page.tsx` renders check events, colored diff view (`+`, `-`, `@@`), detected timestamps, durations, and links to re-captures. Covered by route and UI unit tests in `watch-routes.test.ts`. |

### Live Scheduled Webhook & Confirm-Before-Acting Verification Results (Part 3 Walkthrough)
- **Public Webhook URL:** `https://locations-variance-records-prev.trycloudflare.com/api/webhooks/monitor`
- **Baseline Capture ID:** `cap_c5a4915cd3d392403b4107b96ea2096d`
- **Watch Activated:**
  - Watch ID: `watch_mw59pkb4_pf80`
  - Monitor ID: `abe39067-663c-479d-a92d-c422b4a81377`
  - Schedule: `* * * * *` (1 minute)
  - Baseline Content Hash: `d2788fd5e60c641e19478bb640c67b34bd3520d1fd3116b7134262275d4bf4ee`
- **1st Scheduled Webhook (No Change):**
  - Arrival Time: ~16 seconds after activation
  - Run ID: `38386c5f-ddad-427b-9c37-bcdbd4b325c7`
  - Event ID: `wevent_sched_1794073803864_lbq5`
  - Type: `NO_CHANGE`
  - Reason: `Content hash strictly matches baseline (volatile counters/timestamps stripped)`
- **2nd Scheduled Webhook (After Sandbox Post Edit):**
  - Arrival Time: ~60 seconds after edit
  - Run ID: `b982808b-ec7f-48f7-b43a-37d7060e4c07`
  - Event ID: `wevent_sched_1794073863667_jcfo`
  - Webhook Type: `EDITED`
- **Confirm-Before-Acting via runNow:**
  - Triggered automatically by webhook route handler: `runMonitorNow("abe39067-663c-479d-a92d-c422b4a81377")`
  - Confirmation Run ID: `4ef14de6-8ebd-4e29-b726-db89241ed95f`
  - Confirmation Event ID: `wevent_conf_1794073865293_fyce`
  - Confirmation Type: `EDITED` (Agreed with incoming webhook)
  - Linked Automatic Re-Capture: `cap_re_af942c705409feda9422c53c53f16061`
  - Both runs stored in watch events timeline.
  - In-app alert banner displayed on capture page and dashboard.
- **Cleanup & Account Audit:**
  - Sandbox post restored to seed state.
  - Monitor `abe39067-663c-479d-a92d-c422b4a81377` disabled and deleted: `{ "deleted": true }`.
  - `npm run monitor:cleanup` confirmed **0 / 50 active monitors** remaining.
- **Email Alerts (P1 Note):**
  - Email notification via Resend is a P1 feature; skipped because `RESEND_API_KEY` is not configured in the environment. In-app alert banners and automatic cryptographic re-captures are fully active.

### Shortest Monitor Schedule Supported by TinyFish
We empirically tested various cron schedules against the TinyFish Monitor API:
- `* * * * *` (Every 1 minute): **ACCEPTED** (`HTTP 201 Created`)
- `*/5 * * * *` (Every 5 minutes): **ACCEPTED** (`HTTP 201 Created`)
- `*/15 * * * *` (Every 15 minutes): **ACCEPTED** (`HTTP 201 Created`)
- `*/30 * * * *` (Every 30 minutes): **ACCEPTED** (`HTTP 201 Created`)
- `0 * * * *` (Hourly): **ACCEPTED** (`HTTP 201 Created`)

**Finding:** The TinyFish Page Monitor API accepts standard 5-field cron syntax down to **1-minute intervals (`* * * * *`)**. Saakshi UI exposes user-friendly presets: Hourly (`0 * * * *`), Every 6 Hours (`0 */6 * * *`), and Daily (`0 0 * * *`). All temporary test monitors created during this test were deleted immediately.

### TinyFish Upstream Error Handling for Deletions
When a monitored target URL returns HTTP 404 (e.g. deleted post), calling `POST /v1/monitors/{id}/runs` returns HTTP 502 with message `{"error":{"code":"INTERNAL_ERROR","message":"Fetch failed: page_not_found"}}`. In `apps/web/lib/tinyfish/monitor.ts`, `runMonitorNow` catches `page_not_found` and maps it into a structured error `{ code: "page_not_found", status: 404 }`, allowing the classifier in `apps/web/lib/watch/classify.ts` to deterministically emit `DELETED`.

### Live Monitor Verification Results (Part 2 Walkthrough on Deployed Sandbox Post)
- **Target URL:** `https://conf-moon-exciting-saying.trycloudflare.com/sandbox/post/internship-scam-alert`
- **Baseline Capture ID:** `cap_c5a4915cd3d392403b4107b96ea2096d` (Status: `READY`)
- **Watch Activated:**
  - Watch ID: `watch_mw59pkb4_pf80`
  - Monitor ID: `0c36493c-a037-481c-98af-eeb26d50f8d8`
  - Baseline Content Hash: `d2788fd5e60c641e19478bb640c67b34bd3520d1fd3116b7134262275d4bf4ee`
- **Step 2: Check Now with No Change:**
  - Duration: 2,129 ms
  - Result Type: `NO_CHANGE`
  - Reason: `Content hash strictly matches baseline (volatile counters/timestamps stripped)`
  - Event ID: `wevent_1793988721540_j17v`
- **Step 3: Check Now after Post Edit in Sandbox Admin:**
  - Duration: 1,573 ms
  - Result Type: `EDITED`
  - Reason: `Content altered (1 lines added, 1 lines removed)`
  - Re-Capture ID: `cap_re_a496702ed141d679917d11badb926e7f`
  - Diff Excerpt:
```diff
Index: evidence_content.txt
===================================================================
--- evidence_content.txt	previous
+++ evidence_content.txt	current
@@ -2,9 +2,9 @@
  Admin Controls
  ## CareerBridge Global
  @careerbridge\_official
  # Fast-Track Winter Internship Program (Registration Fee Required)
-Exclusive 3-month remote engineering internship at Global AI Labs. Guaranteed stipend of ₹45,000/month. Mandatory one-time documentation and portal registration fee of ₹2,499 to be transferred to UPI id: recruit-verify@payu before 5 PM today. Limited to the first 25 applicants only! Apply immediately.
+Exclusive 3-month remote engineering internship at Global AI Labs. Stipend reduced to ₹15,000/month. Mandatory registration fee increased to ₹4,999 to be transferred to UPI id: altered-scam@payu before midnight. Limited to the first 5 applicants only!
  142328
  Chirp v2.4
  ### Replies & Discussion (3)
  Pooja Verma@pooja\_v
```
  - Alert Banner: Triggered in-app alert banner displaying edit reason and diff excerpt.
- **Step 4: Check Now after Post Deletion in Sandbox Admin:**
  - Detection Time: 6,414 ms (well under the 60-second limit)
  - Result Type: `DELETED`
  - Reason: `Page returned 404/410 or page_not_found deletion status`
  - Re-Capture ID: `cap_re_18e49dea3f2b8060287cf5b050ee66fe`
  - Alert Banner: Triggered critical deletion alert banner on capture view and dashboard.
- **Step 5: Post Restored & Cleanup:**
  - Sandbox post restored to original seed state.
  - Monitor `0c36493c-a037-481c-98af-eeb26d50f8d8` deleted: `{"deleted": true}`.
  - Account verified clean via `npm run monitor:cleanup` (0 active `saakshi-*` monitors).

### How to Record Live Fixtures (`scripts/record-fixture.ts`)
```bash
# 1. Add your real TinyFish key to .env.local:
# TINYFISH_API_KEY=tf_live_...

# 2. Record an existing run by run_id:
npx ts-node -r tsconfig-paths/register scripts/record-fixture.ts run_abc12345

# 3. Or initiate a live run directly:
npx ts-node -r tsconfig-paths/register scripts/record-fixture.ts https://your-domain.vercel.app/sandbox/post/internship-scam-alert
```
