# TinyFish Integration Reference & Operations Manual

This document provides the definitive integration specification for TinyFish services across Saakshi's architecture, matching live APIs, approximate operational costs, and documented API nuances.

## Complete TinyFish Call Matrix

| Endpoint & Protocol | Calling File | Forensic Purpose | Cost / Billing Estimation | Operational Status & Notes |
|---|---|---|---|---|
| `POST /v1/automation/run-async` | [`apps/web/lib/tinyfish/agent.ts`](apps/web/lib/tinyfish/agent.ts) | Dispatches autonomous agent for step-by-step browsing and filmstrip generation | ~1 credit / step (~$0.01 - $0.05 per run) | Production live endpoint; emits `streaming_url` and dispatches `run.completed` webhook. |
| `GET /v1/runs/{id}` | [`apps/web/lib/tinyfish/agent.ts`](apps/web/lib/tinyfish/agent.ts) | Polls run lifecycle status (`RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`) | Included in run cost (no additional fee) | Polling fallback and webhook verification check. |
| `GET /v1/runs/{id}?screenshots=base64` | [`apps/web/lib/tinyfish/agent.ts`](apps/web/lib/tinyfish/agent.ts) | Fetches complete array of base64 step screenshots for the forensic filmstrip | Included in run cost (no additional fee) | Downloaded immediately and hashed as individual step artifacts. |
| `POST /v1/runs/{id}/cancel` | [`apps/web/lib/tinyfish/agent.ts`](apps/web/lib/tinyfish/agent.ts) | Cancels in-flight agent run upon user abort or execution timeout | No additional fee | Invoked on client abort or timeout cleanup. |
| `POST https://api.browser.tinyfish.ai` | [`apps/web/lib/tinyfish/browser.ts`](apps/web/lib/tinyfish/browser.ts) | Initiates managed Chromium session over CDP for full-page screenshot, PDF, DOM, network HAR, and TLS cipher | ~1 credit / session (~$0.02 - $0.05 per session) | Initiated without target URL to attach network listeners before navigation. |
| `DELETE https://api.browser.tinyfish.ai/{id}` | [`apps/web/lib/tinyfish/browser.ts`](apps/web/lib/tinyfish/browser.ts) | Terminates managed Chromium session | No additional fee | Guaranteed execution in `finally` block on all code paths. |
| `POST https://api.fetch.tinyfish.ai` | [`apps/web/lib/tinyfish/fetch.ts`](apps/web/lib/tinyfish/fetch.ts) | Token-efficient clean markdown text and metadata extraction with link analysis | ~0.1 - 0.2 credits (~$0.005 per fetch) | Computes baseline content hash and strips volatile counters. |
| `POST /v1/monitors` | [`apps/web/lib/tinyfish/monitor.ts`](apps/web/lib/tinyfish/monitor.ts) | Registers recurring cron monitor for target URL alterations | Billed per scheduled run (~$0.005 per check) | Accepts standard 5-field cron down to 1-minute intervals (`* * * * *`). |
| `POST /v1/monitors/{id}/runs` | [`apps/web/lib/tinyfish/monitor.ts`](apps/web/lib/tinyfish/monitor.ts) | Executes immediate "Check Now" evaluation or confirmation run | Billed per run (~$0.005 per check) | Executed inline during "Check Now" and "Confirm-Before-Acting" checks. |
| `DELETE /v1/monitors/{id}` | [`apps/web/lib/tinyfish/monitor.ts`](apps/web/lib/tinyfish/monitor.ts) | Deactivates and deletes monitor | No additional fee | Cleaned up on watch deletion or test teardown. |
| `GET https://api.search.tinyfish.ai` | [`apps/web/lib/tinyfish/search.ts`](apps/web/lib/tinyfish/search.ts) | Exact-phrase reverse search agent scanning for duplicate mirrors across the web | ~0.5 credits (~$0.01 per search) | Scans for exact quoted text strings to locate unauthorized mirrors. |

---

## Documented API Mismatches & Edge Case Handling

During live integration and stress-testing, we identified five critical documentation mismatches with TinyFish APIs:

### 1. Webhook Signatures & High-Entropy Query Tokens
- **Mismatch:** TinyFish webhook payloads do not currently supply HMAC signature headers (e.g. `X-TinyFish-Signature`).
- **Solution:** Saakshi provisions unique high-entropy query tokens (`?token=<WEBHOOK_SECRET>`) for every webhook registration and verifies the token on incoming requests. In addition, when a webhook fires, the handler performs an out-of-band verification call (`GET /v1/runs/{id}`) directly to the TinyFish API to confirm the true run status before updating evidence state.

### 2. Account-Gated & Beta Configuration Fields
- **Mismatch:** Setting `agent_config.mode: "strict"` or `agent_config.max_steps` returns HTTP 400/403 on standard developer tiers. Similarly, `capture_config` (`elements`, `screenshots`, `html`) is account-gated and returns HTTP 403 Forbidden.
- **Solution:** Saakshi guards beta and account-gated options behind environment switches (`TINYFISH_AGENT_BETA=true` and `TINYFISH_CAPTURE_CONFIG=true`). By default, the system relies on the prompt-embedded step budget in `GOAL_TEMPLATE` and `agent_config.max_duration_seconds`, ensuring zero configuration errors across all account tiers.

### 3. Monitor "Run-Now" Does Not Dispatch Webhooks
- **Mismatch:** Triggering an immediate run via `POST /v1/monitors/{id}/runs` executes the check synchronously and does **not** dispatch a webhook to the registered URL.
- **Solution:** Saakshi's "Check Now" handler processes the API response inline rather than waiting for an asynchronous webhook, providing immediate sub-2-second feedback to the investigator.

### 4. Upstream 502/Internal Error on Target Deletion
- **Mismatch:** When a monitored page is deleted (returning HTTP 404/410), calling `POST /v1/monitors/{id}/runs` returns an HTTP 502 Bad Gateway with JSON:
  ```json
  {"error":{"code":"INTERNAL_ERROR","message":"Fetch failed: page_not_found"}}
  ```
- **Solution:** `apps/web/lib/tinyfish/monitor.ts` catches `page_not_found` from the upstream error string and maps it into a structured error `{ code: "page_not_found", status: 404 }`, enabling `classifyContentChange()` to deterministically classify the event as `DELETED`.

### 5. Ephemeral Streaming URL Lifecycle
- **Mismatch:** The `streaming_url` returned from `run-async` requires 3-5 seconds to initialize after run creation and is abruptly terminated by the host upon run completion.
- **Solution:** The frontend iframe component renders a graceful loading skeleton while `streaming_url` is initializing, and automatically switches to the full forensic filmstrip carousel as soon as the run transitions to `COMPLETED`.

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
