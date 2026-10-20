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
   - Session creation: `POST https://api.browser.tinyfish.ai` with `{ "url": targetUrl, "timeout_seconds": 120 }`.
   - Connect via `playwright-core` using `chromium.connectOverCDP(cdp_url)`.
   - Captures: full-page PNG screenshot, PDF render, network response log, TLS certificate details (`securityDetails()`), DOM outer HTML.
   - Lifecycle: Session terminated unconditionally via `DELETE https://api.browser.tinyfish.ai/{session_id}` in `finally` block.

3. **Fetch API (`https://api.fetch.tinyfish.ai`)**:
   - Clean, token-efficient markdown extraction.
   - Payload: `{ "urls": [url], "format": "markdown", "links": true, "image_links": true, "ttl": 0, "per_url_timeout_ms": 60000, "include_etag_and_last_modified": true }`.
   - Results: extracted markdown text, title, author, published date, etag, and error states (`bot_blocked`, `page_not_found`, `login_required`).

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
