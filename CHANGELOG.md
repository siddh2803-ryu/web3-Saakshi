# Changelog

All notable changes to the **Saakshi** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.9.0] - 2026-11-22

### Summary
Feature-complete release for the **KRITICAL HACKS '26** Finale (AssetMerkle &times; IGDTUW). Establishes an end-to-end autonomous, court-ready digital evidence preservation pipeline bridging autonomous web agents, statutory Indian evidence law under Section 63(4) BSA, 2023, decentralized IPFS storage, and Polygon Merkle tree settlement.

---

### Phase 0: Groundwork, Monorepo Scaffold & Chirp Sandbox
- **Monorepo Architecture:** Next.js 14 App Router full-stack web application (`apps/web`) and Hardhat Solidity smart contract workspace (`contracts/`).
- **Deterministic Node Runtime:** Enforced Node.js `v20.x` in `.nvmrc` and `.browserslistrc`.
- **Target Simulation (Chirp Sandbox):** Self-contained mock social media application (`/sandbox/post/[slug]`) simulating volatile victim posts with comment threads, relative timestamps, and volatile engagement counters.
- **Admin Moderation Simulator:** Interactive admin console (`/sandbox/admin`) allowing instant, deterministic post mutation (text edit) and HTTP 404 deletion for automated monitoring tests.
- **Offline Fixture Framework:** Pre-recorded deterministic fixtures for testing without live API keys.

---

### Phase 1: TinyFish Web Agent Core
- **Autonomous Agent Dispatch:** Integration with TinyFish Web Agent (`/v1/automation/run-async`) to browse target URLs as a neutral digital observer.
- **Forensic Filmstrip:** Step-by-step action recording with timestamped base64 screenshots captured at each agent interaction step.
- **Live Streaming Preview:** Real-time visual iframe embedding using `streaming_url`.
- **Prompt Isolation & Budgets:** Parameterized `GOAL_TEMPLATE` instructing agents to close cookie banners, expand comment sections up to budget, and prevent any user interaction (likes, shares, comments, form submissions).
- **Soft Failure Detection:** Graceful detection of bot shields, Cloudflare challenges, login paywalls, and captchas, marking captures as `blocked=true` rather than unhandled errors.

---

### Phase 2: Full-Fidelity Browser Capture & Extraction
- **Chrome DevTools Protocol (CDP) Capture:** Integration with TinyFish Browser API (`https://api.browser.tinyfish.ai`) using `playwright-core` connected directly to cloud Chromium instances.
- **Comprehensive Forensic Artifacts:**
  - Full-page lossless PNG screenshot (`screenshot.png`).
  - Full-page printable PDF render (`page_pdf.pdf`).
  - Complete DOM snapshot outer HTML (`dom_html.html`).
  - Full HTTP network request/response HAR log with status codes, headers, and resource timings (`network_log.json`).
  - TLS handshake security details, cipher suite, and certificate issuer/validity specs (`tls_info.json`).
- **Clean Markdown Extraction:** Token-efficient text extraction via TinyFish Fetch API (`api.fetch.tinyfish.ai`) with metadata, outgoing link analysis, and latency tracking.
- **Guaranteed Lifecycle Cleanup:** Unconditional session termination via `DELETE https://api.browser.tinyfish.ai/{session_id}` in `finally` blocks, eliminating stranded browser sessions.

---

### Phase 3: Cryptographic Custody Engine & Canonical Manifests
- **Plaintext Hashing Before Encryption:** Plaintext bytes of all raw artifacts hashed using SHA-256 before any transformation or encryption occurs.
- **RFC 8785 Canonical Serialization:** Evidence manifest structured under schema `saakshi.evidence/v1` and canonically serialized using RFC 8785 (JSON Canonicalization Scheme - JCS) for deterministic, cross-platform hash identity.
- **AES-256-GCM Envelope Encryption:** Per-capture ephemeral 256-bit Data Encryption Key (DEK) with 96-bit random IV and 128-bit authentication tag. DEK encrypted with server master key (`MASTER_KEY_B64`).
- **Decentralized Persistence:** Encrypted payloads pinned to IPFS via Pinata SDK (`pinata`).

---

### Phase 4: Blockchain Settlement (Polygon Amoy & Hardhat)
- **Solidity Smart Contract:** Designed and compiled `EvidenceRegistry.sol` incorporating OpenZeppelin `AccessControl` and `MerkleProof`.
- **OpenZeppelin Merkle Batching:** Manifest SHA-256 digests grouped into Merkle batches with `["bytes32"]` leaf encoding via `@openzeppelin/merkle-tree`.
- **On-Chain Settlement:** Merkle roots committed to Polygon Amoy via `anchorRoot(bytes32 root)`, generating immutable block confirmation and timestamp proofs.
- **Trustless In-Browser Verifier:** Client-side zero-upload verification tool at `/verify` computing file SHA-256 using native WebCrypto (`SubtleCrypto`) and performing direct `eth_call` queries to public Polygon RPC nodes.
- **Local Hardhat Mode:** Full local Ethereum chain support (`npm run chain:node`) for zero-cost offline testing.

---

### Phase 5: AI Evidence Assistance (Google Gemini)
- **Strict User Opt-In:** AI analysis disabled by default, requiring deliberate investigator opt-in.
- **Anti-Prompt-Injection Boundaries:** Captured web content wrapped within strict isolation tags (`<<<UNTRUSTED_CAPTURED_PAGE_TEXT>>>`), preventing prompt injection attacks from adversarial web pages.
- **Structured Legal Classification:** Extraction of involved parties, complaint classification, and bilingual complaint drafting (English and Hindi) targeting official Indian statutory portals:
  - NCRP (National Cyber Crime Reporting Portal - 1930)
  - NCH (National Consumer Helpline - 1915)
  - e-Jagriti (Consumer Commission Redressal)
- **Section 63(4) BSA Part A Certificate:** Automated court-formatted PDF generation (`certificate_part_a_draft.pdf`) with dual IST/UTC timestamps, artifact hash tables, Merkle root annex, and scannable verification QR codes.
- **Derivative Data Separation:** All AI summaries and draft certificates stamped `isDerivative: true` and excluded from the immutable evidence manifest.

---

### Phase 6: Active Page Monitoring & Deletion Alerting
- **Cloud Cron Surveillance:** Integration with TinyFish Monitor API (`/v1/monitors`) accepting schedules down to 1-minute intervals (`* * * * *`).
- **Noise-Filtered Diffing:** Stripping volatile engagement counts (likes, views, retweets) and relative time strings ("2 hours ago") before hash comparison to prevent false alerts.
- **Confirm-Before-Acting Protocol:** Webhook notifications (`EDITED` or `DELETED`) automatically trigger an independent verification check (`runNow`) before alerting the user.
- **Automated Re-Capture Chain:** Confirmed edits or HTTP 404 deletions immediately trigger an autonomous agent re-capture linked via `previousCaptureId`.
- **Forensic Diff Timeline:** Inline visual color-coded diff view and critical in-app deletion banners.

---

### Phase 7: Web Discovery & Reverse Mirror Finder
- **Exact-Phrase Search Agent:** Integration with TinyFish Search API (`api.search.tinyfish.ai`) querying exact quoted text snippets.
- **Mirror Detection:** Automatically locates scraped duplicates, unauthorized re-uploads, or defamatory replicas across the public web.

---

### Phase 8: Legal Case Matters & Constant-Time Sharing
- **Case Investigation Grouping:** Organize related captures, monitors, and certificates into comprehensive legal case files (`/case/[id]`).
- **Aggregated Case ZIP Export:** Export all manifests, decrypted artifacts, and certificates into a single organized archive.
- **Constant-Time Share Links:** Revocable, expiring public share links (`/s/[token]`) backed by 256-bit cryptographic tokens. Only `SHA-256(token)` is persisted; lookups use `crypto.timingSafeEqual` and return uniform 404s for invalid, revoked, or expired tokens.
- **Digital Chain of Custody:** Unbroken forward hash chain ($\text{eventHash}_n = \text{SHA-256}(\text{JCS}(\text{event}_n))$) tracking `CREATE`, `VIEW`, `EXPORT`, and `SHARE` events from genesis to tip, with high-impact events published to the blockchain via `logCustody`.

---

### Phase 9: Production Hardening, Quality, Security & Documentation
- **Part 1 (Security & Reliability Hardening):**
  - Startup environment schema validation with Zod reporting variable names only.
  - Production build guards terminating compilation if any dev/mock flag is enabled.
  - Comprehensive Firestore security rules with Firebase emulator unit tests.
  - Route authentication matrix testing all 17 API endpoints for unauthorized access.
  - Shared in-memory/Firestore rate limiting with `429 Too Many Requests` and `Retry-After`.
  - Hardened Content Security Policy, `frame-ancestors 'none'`, HSTS, and strict Referrer-Policy.
  - Global React error boundary, friendly not-found page, and RFC 7807 uniform API error responses.
  - Structured JSON server logger with automated PII and credential redaction.
  - Automated secret scanning with Gitleaks (`.gitleaks.toml`) on every push and CI run.
  - Complete npm audit remediation across dependencies.
  - Universal smoke test script (`scripts/smoke.ts`) verifying all core routes against any base URL.
- **Part 2 (Readiness, Verification, Quality & Documentation):**
  - Configured canonical base URL resolution for webhooks and QR codes.
  - Validated all 20 P0 requirements with high-resolution UI screenshots staged in `docs/evidence/`.
  - Accessible and responsive layout optimizations for 375px mobile viewports.
  - Complete SEO metadata, Open Graph preview tags, `robots.txt`, and `sitemap.xml`.
  - Overhauled `README.md` with visual UI gallery, complete TinyFish integration matrix, honest Polygon Amoy deployment notes, and multi-method verification instructions.
  - Finalized `docs/TINYFISH.md` and `docs/ARCHITECTURE.md`.
  - Authored comprehensive `docs/SECURITY.md` threat model.
