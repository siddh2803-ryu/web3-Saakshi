# Saakshi: Product Requirements Document (PRD)

**An AI witness for the internet.** Agentic, tamper-proof, court-ready web evidence. Captured by TinyFish web agents, fingerprinted with SHA-256, anchored on-chain.

| | |
|---|---|
| Product | Saakshi |
| Team | Team Eclipse (Siddharth Dhawan, Pratham Jaiswal, Parnika Agarwal, Navya Khurana) |
| Event | KRITICAL HACKS '26 (AssetMerkle x IGDTUW), Web3 track, Student category |
| Mandatory integration | TinyFish (Web Agent, Browser API, Fetch, Search, Monitor) |
| PRD version | v1.0, 20 Oct 2026 |
| Build tool | Google Antigravity (agentic IDE), phase by phase from this document |
| Finale | 31 Oct to 1 Nov 2026. Working MVP must be deployed and demo-ready by 30 Oct |

---

## 0. How to use this PRD with Antigravity

1. Create the repo, then save this file as `docs/PRD.md`. Antigravity should read it before every phase.
2. Build **one phase at a time** (Section 17). Each phase has tasks, acceptance criteria and a commit message. Do not start the next phase until the current phase's acceptance criteria pass.
3. Give the agent TinyFish's own context pages: `https://docs.tinyfish.ai/for-coding-agents` and `https://docs.tinyfish.ai/llms.txt`. Field names in Section 7 come from those docs (checked 20 Oct 2026); if the live docs differ, the live docs win.
4. Rules for the coding agent (paste into Antigravity's rules or the first prompt):
   - Never commit secrets. All keys live in `.env.local` and Vercel env vars. Keep `.env.example` updated.
   - Keep the TinyFish API key on the server only. The browser never talks to TinyFish directly.
   - Commit small and often with clear messages. Judges score "visible commits" (20 points), so a healthy history matters.
   - Write unit tests for hashing, canonical JSON, Merkle proofs, encryption and the smart contract.
   - Do not mock TinyFish in production code paths. A fixture mode exists only for UI work (Section 7.8).
   - Use TypeScript strict mode. No `any` in `lib/evidence` or `lib/chain`.
5. A ready-to-paste kickoff prompt is in Appendix A.

---

## 1. Summary

**Problem.** Harassing posts, fake job pages, scam listings and defamatory content get edited or deleted within hours. Victims keep phone screenshots, which are easy to fake and prove nothing about when, where, or whether they were altered. Section 63(4) of the Bharatiya Sakshya Adhiniyam, 2023 (BSA) requires electronic evidence to carry a certificate that discloses the record's hash value, and the Supreme Court upheld this in *Pune Bar Association v. Union of India* (May 2026). Ordinary people have no easy way to produce that.

**Solution.** The user pastes a link and a short goal. Saakshi:

1. **Captures** the page with a TinyFish web agent that browses like a person and records every step, plus a full-page browser capture and a clean text fetch.
2. **Fingerprints** every artifact with SHA-256 and writes a canonical evidence manifest.
3. **Encrypts** the artifacts and stores them on IPFS.
4. **Anchors** the manifest hash in a Merkle tree whose root is written to a smart contract on Polygon, giving a timestamp nobody can change.
5. **Watches** the URL with TinyFish Monitor. If the content is edited or deleted, Saakshi re-captures it, shows the diff and alerts the user.
6. **Explains** the evidence with an AI summary and a complaint draft (English and Hindi), and generates a **draft Part A** of the s.63(4) certificate.
7. Lets **anyone verify** a file against the chain on a public page, without trusting Saakshi's server.

**Users need no crypto wallet.** Saakshi's server signs anchoring transactions with one team-owned "anchor node" wallet. Users only see a verify link and QR code.

---

## 2. Goals, non-goals and success metrics

### 2.1 Goals (MVP, by 30 Oct)

- G1. End-to-end capture of a public URL with TinyFish in about 3 minutes or less.
- G2. Every artifact hashed, listed in a manifest, encrypted and stored on IPFS.
- G3. Manifest hash anchored on Polygon Amoy testnet; verifiable on a public page and on-chain.
- G4. Edit or deletion detection on a watched URL, with automatic re-capture and text diff.
- G5. AI summary, issue categories, suggested reporting channels, complaint drafts (EN/HI).
- G6. Downloadable evidence bundle (ZIP) and draft s.63(4) Part A PDF.
- G7. Public GitHub repo with clear README, visible commits, a 2 to 3 minute demo video and a public social post.

### 2.2 Non-goals (MVP)

- No guarantee of legal admissibility. Saakshi pre-fills Part A only. Part B needs a qualified expert.
- No mainnet deployment, no tokens, no NFTs, no user wallets.
- No capture of private content without the user's own logged-in session (logged-in capture is a stretch goal).
- No mobile app (responsive web only). No WhatsApp bot (roadmap).

### 2.3 Success metrics for the finale

| Metric | Target |
|---|---|
| Capture success rate (sandbox page + 5 public test URLs) | 90% or better |
| Median time from "Capture" click to "Ready" | 3 minutes or less |
| Verification of anchored captures | 100% pass |
| Tamper test (change 1 byte in a screenshot, then verify) | 100% fail, with a clear "No match" message |
| Deletion detected on sandbox post after "Check now" | Under 60 seconds |
| TinyFish products used meaningfully | 5 (Agent, Browser, Fetch, Search, Monitor) |

---

## 3. Judging rubric alignment

| Criterion (points) | How Saakshi covers it | Where |
|---|---|---|
| Working GitHub project (20) | Public repo, deployed app, clear README, phase-wise commits, tests | Sections 15, 17, 18 |
| TinyFish integration (20) | Five products, each doing an essential job; README table linking to the code | Section 7, README |
| Social media post (10) | Public post with demo clip, GitHub link, plain-language pitch | Section 19.2 |
| Technique (10) | Canonical manifests, Merkle batching, on-chain verify, envelope encryption, async orchestration | Sections 8 to 11 |
| Innovation (20) | Agent step trail as forensic capture log, deletion watch, India-specific s.63(4) draft, trustless verify | Sections 1, 6 |
| Impact (10) | Harassment survivors, scam victims, consumers, lawyers, journalists; "Saakshi for Her" free tier | Section 4 |
| Revenue model (10) | Priced tiers with unit economics from TinyFish's public pricing | Section 20 |

---

## 4. Users and personas

| Persona | Situation | What they need from Saakshi |
|---|---|---|
| Riya, 19, student | Anonymous account posts a morphed photo of her; post may be deleted | Fast, independent capture; deletion alert; complaint draft for the cybercrime portal |
| Aman, 21, job seeker | Fake internship page asked for a "training fee", then vanished | Proof of the page and payment instructions; repost finder |
| Mrs. Kapoor, shopper | Seller changed the listing after the sale | Before/after capture with diff; consumer complaint draft |
| Adv. Sharma, lawyer | Needs proof of defamatory posts for a client | Bundle with hashes, Part A draft, custody log (Pro plan) |
| Journalist / fact-checker | Must preserve claims before they are scrubbed | Bulk captures, watch, public verify link |

### 4.1 User stories (MVP)

| ID | Story | Priority |
|---|---|---|
| US-01 | As a user, I sign in with Google or email so my evidence is private to me. | P0 |
| US-02 | As a user, I paste a URL and a short goal and start a capture after confirming consent. | P0 |
| US-03 | As a user, I watch the TinyFish browser live while my capture runs. | P0 |
| US-04 | As a user, I see every artifact (step screenshots, full page, PDF, text, network log) with its SHA-256. | P0 |
| US-05 | As a user, I anchor my capture on-chain and get a verify link and QR code. | P0 |
| US-06 | As anyone with a file from the bundle, I can verify it on a public page without signing in. | P0 |
| US-07 | As a user, I can turn on "Watch" so Saakshi alerts me if the page is edited or deleted. | P0 |
| US-08 | As a user, I get an AI summary, possible issue categories and a complaint draft in English and Hindi. | P0 |
| US-09 | As a user, I download a ZIP bundle and a draft s.63(4) Part A PDF. | P0 |
| US-10 | As a user, I group captures into a case. | P1 |
| US-11 | As a user, I find reposts and mirrors of the same content and capture them too. | P1 |
| US-12 | As a user, I share a read-only, expiring link to a capture with a lawyer or the police. | P1 |
| US-13 | As a user, every export, share and verify on my evidence is recorded in a custody log, with key events on-chain. | P1 |
| US-14 | As a user, I capture content that needs my own login, through a consented browser profile. | P2 (stretch) |

---

## 5. Scope

| Area | MVP (P0) | P1 (if time) | P2 / roadmap |
|---|---|---|---|
| Capture | Agent capture + step screenshots, Browser API full page + PDF + network log + TLS, Fetch text | Agent video recording (if account enabled), HTML step snapshots (if enabled) | Logged-in capture with Browser Context Profiles |
| Proof | SHA-256, manifest, Merkle, Polygon Amoy anchor, verify page | On-chain custody events for export and share | Mainnet, C2PA content credentials |
| Watch | Page Monitor, webhook, "Check now", diff, auto re-capture, in-app alert | Email alerts (Resend) | Topic Monitor for repost alerts |
| AI | Summary, entities, categories, channels, EN/HI complaint drafts | Repost key-phrase extraction | Regional languages |
| Outputs | ZIP bundle, Part A draft PDF, QR | Share links | Lawyer dashboard, e-court formats |
| Search | (none) | Repost finder with "capture this too" | Scheduled repost alerts |

---

## 6. Functional requirements

### F1. Authentication and onboarding (P0)

- FR-1.1 Firebase Auth with Google sign-in and email link.
- FR-1.2 First sign-in creates `users/{uid}` with plan `free`, daily capture quota 5.
- FR-1.3 Landing page explains Saakshi in 3 steps, with a "Verify a file" entry point that needs no sign-in.

### F2. New capture (P0)

- FR-2.1 Form fields: URL (required, http/https), goal (optional, max 300 chars, placeholder "Capture the post, caption, top comments and the author's profile"), mode (`standard` or `deep`), case (optional), consent checkbox (required).
- FR-2.2 Consent text: "I am preserving content that concerns me or that I have a legitimate reason to preserve. I will not use Saakshi to stalk or harass anyone."
- FR-2.3 Validate the URL server-side. Reject non-http(s), localhost and private IP ranges.
- FR-2.4 Enforce quota. Show remaining captures.
- FR-2.5 On submit, create the capture record and start the pipeline (F3). Redirect to the live capture page.

### F3. Capture pipeline (P0)

States (stored in `captures/{id}.status`, shown as a timeline in the UI):

`QUEUED > AGENT_RUNNING > AGENT_DONE > BROWSER_CAPTURE > FETCHING > FINGERPRINTING > ENCRYPTING > UPLOADING > ANALYZING > READY > ANCHORING > ANCHORED` (or `FAILED` with `error.stage` and `error.message`)

- FR-3.1 Start the TinyFish agent run asynchronously (`run-async`) with `webhook_url` (Section 7.1). Save `run_id`.
- FR-3.2 While running, the capture page polls `GET /api/captures/:id` every 3 seconds. The server reads `GET /v1/runs/{id}` and returns `status`, `streaming_url` and step count.
- FR-3.3 When the run completes (webhook, or poller sees `COMPLETED`), call the internal `finalize` step once. Guard it with a Firestore transaction lock so it can't run twice.
- FR-3.4 Finalize does, in order: pull agent steps with screenshots, Browser API capture, Fetch, fingerprint every artifact, encrypt and upload to IPFS, build and upload the manifest (it needs the CIDs, so it comes last), then AI analysis. Each sub-step appends to an event log shown in the UI.
- FR-3.5 Treat `COMPLETED` as "the agent finished", not "the goal succeeded". If the result says `blocked`, or mentions captcha, access denied or login required, mark the capture `PARTIAL` and still keep whatever artifacts exist.
- FR-3.6 Any sub-step failure keeps earlier artifacts and records the error. The user can press "Retry from failed step".

### F4. Fingerprinting and manifest (P0)

- FR-4.1 Compute SHA-256 over the **plaintext bytes** of every artifact before encryption.
- FR-4.2 Build `manifest.json` (schema in Section 9.2). Serialize with RFC 8785 JSON Canonicalization (JCS). `manifestSha256 = SHA-256(JCS(manifest))`.
- FR-4.3 Compute `contentHash = SHA-256(normalizedText)` from the Fetch markdown (normalize: Unicode NFC, collapse whitespace, trim). This survives layout changes and powers the watch diff.
- FR-4.4 Show each artifact with kind, size, SHA-256 (copy button) and a preview.

### F5. Encryption and storage (P0)

- FR-5.1 Envelope encryption: generate a random 256-bit data key (DEK) per capture; encrypt each artifact with AES-256-GCM (random 96-bit IV); wrap the DEK with `MASTER_KEY` (AES-256-GCM) and store the wrapped DEK in Firestore.
- FR-5.2 Upload each encrypted artifact to IPFS via Pinata; save the CID. Also upload the plaintext `manifest.json` (it has hashes and metadata only, no media) unless the user marks the capture "private manifest".
- FR-5.3 Server decrypts on demand for the owner (preview, bundle download).
- FR-5.4 P2: user-held keys (DEK wrapped with a key derived from the user's passphrase in the browser). The pitch deck mentions user-held keys, so present the MVP honestly as "server-managed envelope keys now, user-held keys next".
- FR-5.5 Deleting a capture removes the wrapped DEK (crypto-shredding) and unpins the CIDs. Hashes already on-chain remain and reveal nothing about the content. Explain this in the UI.

### F6. Anchoring (P0)

- FR-6.1 "Anchor now" button (MVP and demo) anchors a batch immediately, even a batch of one.
- FR-6.2 P1: a scheduled job every 30 minutes anchors all `READY` captures in one batch.
- FR-6.3 Batch = OpenZeppelin `StandardMerkleTree` over leaves `[manifestSha256]` with encoding `["bytes32"]`. Upload a batch file (leaves + tree dump) to IPFS. Call `anchorRoot(root, size, batchCid)`.
- FR-6.4 Store per capture: `root`, `proof[]`, `txHash`, `blockNumber`, `anchoredAt` (block timestamp), `chainId`, `contract`.
- FR-6.5 Write `publicProofs/{sha256}` for every artifact hash and for the manifest hash, so the verify page can look them up.
- FR-6.6 Show "Anchored at <block time IST> in block #N" with a Polygonscan link and a QR code to `/v/{captureId}`.

### F7. Public verification (P0)

- FR-7.1 `/verify`: drag-and-drop one or more files, or a whole bundle ZIP. Hash files **in the browser** with WebCrypto, so files never leave the device.
- FR-7.2 Look up each hash in `publicProofs`. Then call the contract's `verify(manifestHash, proof, root)` **directly from the browser** through a public Amoy RPC (ethers.js), so the chain check does not depend on Saakshi's server.
- FR-7.3 Result card: green "Verified: this exact file existed unaltered at <time> (block #N)" or red "No match: this file differs from anything Saakshi anchored". Show what was checked, step by step.
- FR-7.4 `/v/{captureId}`: public summary page (capture time, artifact kinds and hashes, anchor details). It shows the target URL only if the owner allowed it.
- FR-7.5 The bundle includes `proof.json` and `VERIFY.md`, so anyone can verify offline with the included `scripts/verify.ts` (P1).

### F8. Watch: edit and deletion detection (P0)

- FR-8.1 "Watch this page" creates a TinyFish Page Monitor (Section 7.5) with an hourly default schedule (options: hourly, every 6 hours, daily) and a `purpose` describing what counts as a meaningful change.
- FR-8.2 Store the baseline `contentHash` from the monitor's creation run.
- FR-8.3 Scheduled results arrive at `POST /api/webhooks/monitor?token=...`. The handler normalizes the text, hashes it and classifies the result: `NO_CHANGE`, `EDITED`, `DELETED` or `BLOCKED` (rules in Section 7.5).
- FR-8.4 On `EDITED` or `DELETED`: create a watch event, compute a line diff against the last capture's text, start an automatic **re-capture** (new capture with `previousCaptureId`), and raise an in-app alert (email in P1).
- FR-8.5 "Check now" calls Monitor run-now. Run-now does not fire webhooks, so process its response inline with the same logic. This is what the live demo uses.
- FR-8.6 The watch timeline shows every check with type, time and a link to the diff and re-capture.

### F9. AI analysis (P0)

- FR-9.1 Gemini receives the agent's structured result, the Fetch text (truncated to about 20k characters) and up to 3 step screenshots.
- FR-9.2 Output follows the JSON schema in Section 12.2: summaries (EN, HI), parties, key claims, timestamps found, possible issue categories with confidence, suggested reporting channels, complaint drafts (EN, HI), caveats.
- FR-9.3 Label all AI output "AI-generated, not part of the original evidence". Store it as a separate file `ai_analysis.json` (hashed, encrypted, stored) but **keep it out of the anchored manifest**. The anchored evidence contains only what was captured from the web.
- FR-9.4 Never state legal conclusions. Use "may be relevant" language and always include the caveat line.

### F10. Evidence bundle and certificate (P0)

- FR-10.1 `GET /api/captures/:id/bundle` streams a ZIP: plaintext artifacts, `manifest.json`, `proof.json`, `ai_analysis.json`, `certificate_part_a_draft.pdf`, `VERIFY.md`.
- FR-10.2 The Part A draft PDF follows Section 13.
- FR-10.3 Every bundle download writes a custody event (`EXPORT`).

### F11. Repost finder (P1)

- FR-11.1 Gemini picks 1 or 2 distinctive phrases (12 words or fewer) from the content.
- FR-11.2 TinyFish Search runs exact-phrase queries (quoted) and returns up to 10 results each.
- FR-11.3 Show results with "Capture this too", which starts captures in the same case.

### F12. Cases and dashboard (P1)

- FR-12.1 Dashboard lists captures with status chips (Ready, Anchored, Watching, Edited, Deleted).
- FR-12.2 A case groups captures with a title and notes and offers a case-level ZIP export.

### F13. Custody log (P1)

- FR-13.1 Record `CREATE`, `VIEW`, `EXPORT`, `SHARE`, `VERIFY` events in Firestore with a hashed actor ID.
- FR-13.2 `EXPORT` and `SHARE` also emit an on-chain `Custody` event (server signs). Show the tx link.

### F14. Share links (P1)

- FR-14.1 Owner creates a read-only link that expires (24 hours, 7 days, 30 days). The recipient can view and download the bundle. Every access is a custody event.

### F15. Sandbox demo target (P0, demo only)

- FR-15.1 `/sandbox/post/[slug]` renders a **fictional** social post on a made-up platform called "Chirp" (author, handle, text, image, likes, comments). It must not imitate any real platform's branding.
- FR-15.2 `/sandbox/admin` (protected by `SANDBOX_ADMIN_SECRET`) lets the team edit the post text or "delete" it. A deleted post returns HTTP 404 and shows "This post has been removed".
- FR-15.3 Seed 2 posts. The demo captures one, then edits or deletes it live to trigger watch detection. This keeps the demo reliable even if real platforms block bots.

---

## 7. TinyFish integration specification

Auth header `X-API-Key: $TINYFISH_API_KEY` on every call. TypeScript SDK: `npm install @tiny-fish/sdk` (reads `TINYFISH_API_KEY`). Use raw `fetch` where the SDK lacks a method. All calls live in `apps/web/lib/tinyfish/`.

### 7.1 Web Agent: goal-driven capture (P0)

- Endpoint: `POST https://agent.tinyfish.ai/v1/automation/run-async`
- Status: `GET https://agent.tinyfish.ai/v1/runs/{id}` (fields: `status` in `PENDING | RUNNING | COMPLETED | FAILED | CANCELLED`, `streaming_url`, `num_of_steps`, `result`, `error`, `video_url`, `steps[]`)
- Steps with screenshots: `GET /v1/runs/{id}?screenshots=base64` returns `steps[]` items with `id`, `timestamp`, `status`, `action`, `screenshot` (data URI, JPEG), `html` (URL, only if HTML capture is enabled), `duration`.
- Cancel: `POST /v1/runs/{id}/cancel`

Request body:

```json
{
  "url": "<target url>",
  "goal": "<GOAL_TEMPLATE filled in>",
  "browser_profile": "stealth",
  "proxy_config": { "enabled": true, "type": "tinyfish", "country_code": "US" },
  "output_schema": { "...": "see below" },
  "webhook_url": "https://<app-domain>/api/webhooks/tinyfish?token=<WEBHOOK_SECRET>",
  "agent_config": { "max_duration_seconds": 180 }
}
```

Notes:

- `agent_config.max_steps` and `agent_config.mode: "strict"` are **beta** and return 403 on accounts without beta access. Send them only if `TINYFISH_AGENT_BETA=true`. Otherwise rely on `max_duration_seconds` and the step budget written in the goal.
- `capture_config` (extra `html`, `recording`, `snapshots`) is **account-gated** and returns 403 if not enabled. Send it only if `TINYFISH_CAPTURE_CONFIG=true`. Ask the organizers or TinyFish to enable it; it adds HTML snapshots per step and a video.
- If `video_url` is present on the run, download it **immediately** (it expires after 15 minutes) and store it as artifact `agent_video`.
- Check `result.blocked`, plus the words captcha, blocked, access denied and login required in the result, to detect a soft failure (FR-3.5).

GOAL_TEMPLATE (keep in `lib/tinyfish/prompts.ts`):

```text
You are a neutral evidence-capture agent. Your only job is to view and record this page exactly as a normal visitor sees it.
1. Open the page. If a cookie banner or pop-up blocks the content, close it or choose the minimum option needed to view the page.
2. Scroll slowly to load the full main content. Click "see more" or "read more" on the main content if present.
3. If there is a comment section, expand and scroll it until about {COMMENT_LIMIT} comments are visible.
4. If an author or profile link is visible, record its URL but do not open it unless the user focus below asks for it.
5. Never like, comment, follow, share, post, sign in, sign up, pay or submit any form.
6. Finish within {STEP_BUDGET} actions.
User focus: {USER_GOAL}
Return the data in the requested schema. If the page is blocked, requires login, shows a captcha or says the content is unavailable, set blocked=true and explain in block_reason.
```

Defaults: `standard` mode uses COMMENT_LIMIT 20 and STEP_BUDGET 15. `deep` mode uses COMMENT_LIMIT 60 and STEP_BUDGET 30.

`output_schema` (top level must be an object; no `oneOf`, `const` or `additionalProperties`; use `nullable: true`):

```json
{
  "type": "object",
  "properties": {
    "page_title": { "type": "string", "nullable": true },
    "platform": { "type": "string", "nullable": true },
    "author_name": { "type": "string", "nullable": true },
    "author_handle": { "type": "string", "nullable": true },
    "author_profile_url": { "type": "string", "nullable": true },
    "published_at_text": { "type": "string", "nullable": true },
    "content_text": { "type": "string", "nullable": true },
    "media": {
      "type": "array",
      "items": { "type": "object", "properties": { "type": { "type": "string" }, "url": { "type": "string" } }, "required": ["type", "url"] }
    },
    "engagement": {
      "type": "object",
      "properties": {
        "likes": { "type": "string", "nullable": true },
        "comments": { "type": "string", "nullable": true },
        "shares": { "type": "string", "nullable": true },
        "views": { "type": "string", "nullable": true }
      }
    },
    "comments": {
      "type": "array",
      "items": { "type": "object", "properties": { "author": { "type": "string" }, "text": { "type": "string" }, "time_text": { "type": "string", "nullable": true } }, "required": ["text"] }
    },
    "blocked": { "type": "boolean" },
    "block_reason": { "type": "string", "nullable": true }
  },
  "required": ["blocked", "media", "comments"]
}
```

Live preview: forward only `streaming_url` to the browser and show it in an `<iframe>` (view-only). It arrives a few seconds after the run starts and may stop working after the run ends, so show a placeholder before and after.

### 7.2 Browser API: full-fidelity capture (P0)

- Create: `POST https://api.browser.tinyfish.ai` with `{ "url": "<target>", "timeout_seconds": 120 }`. Response `201`: `session_id`, `cdp_url`, `base_url`. Creation takes 10 to 30 seconds (client timeout 60 seconds).
- Connect with `playwright-core`: `chromium.connectOverCDP(cdp_url)`, then use `browser.contexts()[0].pages()[0]`.
- Capture:
  - `page.waitForLoadState("networkidle")` (cap at 20 seconds), then scroll to the bottom in steps to trigger lazy loading.
  - `page.screenshot({ fullPage: true, type: "png" })` gives artifact `fullpage_screenshot`.
  - `page.pdf({ printBackground: true })` gives artifact `page_pdf`. If it throws over CDP, skip it and log a warning.
  - Network log: listen to `page.on("response")` before reloading once; record URL, status, method, resource type, content type and timing as `network_log.json`.
  - TLS: `await mainResponse.securityDetails()` gives protocol, issuer, subject, validFrom, validTo, saved as `tls_info.json`.
  - Also save `page.url()` (final URL), `page.title()` and `document.documentElement.outerHTML` as `dom_html`.
- Terminate: `DELETE https://api.browser.tinyfish.ai/{session_id}` (always, in `finally`).
- Handle `402` (wallet empty), `429` (honor `Retry-After`) and `503` (retry once after 5 seconds).

### 7.3 Fetch API: clean text (P0)

- `POST https://api.fetch.tinyfish.ai` with:

```json
{ "urls": ["<final url>"], "format": "markdown", "links": true, "image_links": true, "ttl": 0, "per_url_timeout_ms": 60000, "include_etag_and_last_modified": true }
```

- Use `results[0].text` (markdown), plus `title`, `description`, `author`, `published_date`, `language`, `links`, `image_links`, `etag`, `last_modified`. Save as artifact `fetch_markdown` plus `fetch_meta.json`.
- `errors[]` codes include `timeout`, `bot_blocked`, `page_not_found` (with `status`), `login_required`. Record them; they also feed deletion detection.
- Client timeout 150 seconds. Fetch is free within the daily allowance (1,000 URLs per day).

### 7.4 Search API: repost finder (P1)

- `GET https://api.search.tinyfish.ai?query=<"exact phrase">&location=IN&language=en`. If `IN` is not accepted, fall back to `US`.
- Optional `recency_minutes` (do not combine with date filters).
- Show title, URL and snippet. "Capture this too" starts a new capture in the same case.
- Search is free within limits (30 requests per minute).

### 7.5 Monitor API: watch for edits and deletions (P0)

- Create: `POST https://agent.tinyfish.ai/v1/monitors`

```json
{
  "type": "fetch",
  "name": "saakshi-<captureId>",
  "config": { "url": "<final url>", "format": "markdown" },
  "schedule_cron": "CRON_TZ=Asia/Kolkata 0 * * * *",
  "purpose": "Evidence watch. Flag any change to the main post text, author, media or comments, and flag if the page is removed, made private or shows 'content unavailable'.",
  "webhook_url": "https://<app-domain>/api/webhooks/monitor?token=<WEBHOOK_SECRET>"
}
```

- Response `201` has `monitor` (`id`, `status`, ...) and the baseline `run` (`is_baseline: true`, `results[]` with `text`, `final_url`, `title`; `errors[]`). Store the baseline content hash.
- Run now: `POST /v1/monitors/{id}/runs` returns `201` with `run`. **Run-now does not trigger the webhook**, so process the response inline.
- Pause, resume, edit and delete: use the "Update a Monitor" and "Delete a Monitor" endpoints on `/v1/monitors/{id}`.
- Scheduled webhook payload (page monitor): `fetch_monitor_id`, `id`, `is_baseline`, `results`, `errors`. It is sent for every scheduled run, including no-change runs.
- There is **no API for run history**, so Saakshi stores every result it receives as a watch event.
- Default to hourly.
- Cost: $0.005 per completed run plus one Fetch (free within the allowance).

Classification rules (`lib/watch/classify.ts`):

| Result | Rule |
|---|---|
| `DELETED` | `errors[]` has `page_not_found` or HTTP 404/410, **or** normalized text matches removal phrases ("this post has been removed", "content isn't available", "page not found", "account suspended") |
| `BLOCKED` | `errors[]` has `bot_blocked`, `login_required` or `timeout` (do not treat as deletion; retry at the next check) |
| `EDITED` | New `contentHash` differs from the last known hash, and the change is more than trivial (diff touches at least 1 line of main content after removing timestamps and counters like "5 min ago" and like counts) |
| `NO_CHANGE` | Otherwise |

### 7.6 Browser Context Profiles: logged-in capture (P2)
### 7.7 Error handling and budgets
### 7.8 Fixture mode (development only)
- `TINYFISH_MODE=fixture` makes `lib/tinyfish/*` return recorded JSON and images from `fixtures/`.
- UI shows yellow "FIXTURE MODE" banner. Production must fail if `NODE_ENV=production` and `TINYFISH_MODE=fixture`.

---

## 8. Architecture and tech stack
[See PRD sections above]

## 9. Data model
[See PRD sections above]

## 10. Internal API
[See PRD sections above]

## 11. Smart contract and Merkle anchoring
[See PRD sections above]

## 12. AI layer (Gemini)
[See PRD sections above]

## 13. Draft certificate: s.63(4) Part A
[See PRD sections above]

## 14. Non-functional requirements
[See PRD sections above]

## 15. UX and screens
[See PRD sections above]

## 16. Repository structure and environment
[See PRD sections above]

## 17. Build plan for Antigravity
[See PRD sections above]

## 18. Testing and quality
[See PRD sections above]

## 19. Demo and social post
[See PRD sections above]

## 20. Business model
[See PRD sections above]

## 21. Risks and open questions
[See PRD sections above]
