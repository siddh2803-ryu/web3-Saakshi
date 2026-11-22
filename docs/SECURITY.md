# Saakshi Security Specification & Threat Model

This document outlines the threat model, security boundaries, cryptographic controls, and secret management policies implemented in Saakshi.

---

## 1. Threat Modeling Overview

Saakshi operates as a neutral digital evidence preservation system. Because digital evidence is utilized in formal dispute resolution, law enforcement filings, and judicial proceedings under Section 63(4) of the Bharatiya Sakshya Adhiniyam, 2023 (BSA), the system must resist both external malicious adversaries and potential abuse by platform users.

---

## 2. Threat Analysis & Mitigations

### Threat 1: Stalking & Surveillance Misuse
- **Threat Scenario:** A bad actor attempts to abuse Saakshi's autonomous Chromium web agents or recurring page monitors to conduct automated cyberstalking, track an individual's private social media activity, monitor real-time location posts, or gather non-public personal information.
- **Security Mitigations:**
  1. **Strictly Public Browsing Only:** TinyFish agents browse in clean, isolated, ephemeral Chromium instances without stored sessions. They **never** authenticate, log in, submit credentials, or pass session cookies.
  2. **Paywall & Privacy Gates:** Any target URL requiring login, identity verification, payment, or gated membership triggers an immediate `blocked=true` response. The agent never attempts bypasses.
  3. **No Interactive Actions:** Agents are bound by immutable system instructions forbidding social engagement: agents cannot like, comment, message, follow, vote, or post.
  4. **Actor Pseudonymization:** User identifiers are salted and hashed (`actorHash = SHA-256(UID_HASH_SALT + ":" + uid)`) in custody logs.
  5. **Shared Rate Limiting:** Capture dispatch, monitor registration, and AI drafting endpoints are rate-limited with HTTP 429 backoff to prevent continuous polling abuse.

---

### Threat 2: Fake or Spoofed Webhooks
- **Threat Scenario:** An attacker observes or guesses the webhook endpoints (`/api/webhooks/tinyfish` or `/api/webhooks/monitor`) and posts fabricated run results to mark compromised captures as authentic, fabricate post edits/deletions, or poison evidence data.
- **Security Mitigations:**
  1. **High-Entropy Secret Tokens:** Webhook registrations provision a cryptographically secure random token passed as a query parameter (`?token=<WEBHOOK_SECRET>`). Requests lacking a valid token are rejected immediately.
  2. **Out-of-Band Upstream Verification:** Webhook payloads are **not** trusted at face value. When a webhook arrives claiming completion, the server invokes `GET /v1/runs/{id}` directly against TinyFish upstream servers using the server's private `TINYFISH_API_KEY` to verify the run status and retrieve raw results.
  3. **Idempotency & Replay Protection:** Webhook runs are deduplicated using database event IDs; duplicate deliveries are discarded safely.
  4. **Strict Schema Parsing:** Payloads must parse through Zod schemas before processing.

---

### Threat 3: Tampered Evidence & Data Modification at Rest
- **Threat Scenario:** An adversary gains read/write access to IPFS pins or the application database and modifies screenshots, DOM snapshots, or PDF certificates to frame an innocent party or destroy inculpatory evidence.
- **Security Mitigations:**
  1. **Plaintext Hashing Before Encryption:** Plaintext artifact bytes are hashed using SHA-256 immediately upon generation, prior to encryption and persistence.
  2. **Canonical Manifest Serialization:** The evidence manifest is normalized and serialized according to RFC 8785 (JSON Canonicalization Scheme - JCS). The manifest's SHA-256 digest represents an unalterable commitment to the exact set of artifacts.
  3. **On-Chain Merkle Anchoring:** Manifest hashes are batched into OpenZeppelin Merkle Trees and anchored to the `EvidenceRegistry` contract on Polygon Amoy. A single-bit alteration in any artifact invalidates its SHA-256, breaking the Merkle proof.
  4. **Blockchain Timestamp Anchor:** Polygon block timestamps mathematically prove the evidence existed in that exact state no later than the confirmed block timestamp $T_{\text{block}}$.
  5. **Cryptographic Chain of Custody:** Custody events are chained via $\text{eventHash}_n = \text{SHA-256}(\text{JCS}(\text{event}_n))$. Any altered or deleted audit log breaks the chain from genesis to tip.
  6. **Zero-Knowledge In-Browser Verifier:** The `/verify` interface computes file hashes locally in the browser via WebCrypto and queries public Polygon RPC nodes directly, ensuring verification succeeds or fails independent of Saakshi's operational state.

---

### Threat 4: Leaked or Brute-Forced Share Links
- **Threat Scenario:** A victim shares an evidence bundle with counsel via `/s/{token}`, but the token is intercepted over insecure channels, brute-forced by an attacker, or accessed after expiration.
- **Security Mitigations:**
  1. **256-Bit Cryptographic Entropy:** Share tokens are generated with 32 cryptographically secure random bytes (`crypto.randomBytes(32).toString("hex")`).
  2. **Hashed Persistence:** Plaintext tokens are **never** stored in the database. Only `tokenHash = SHA-256(token)` is retained.
  3. **Constant-Time Comparison:** Lookups verify hashes using `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
  4. **Uniform 404 Response:** Expired, revoked, and nonexistent tokens return identical HTTP 404 responses with no distinguishable latency or error messages, preventing token enumeration.
  5. **Strict Referrer & Header Policy:** Share routes enforce `Referrer-Policy: no-referrer` and `frame-ancestors 'none'` to prevent token leakage via HTTP Referer headers.

---

### Threat 5: Cryptographic Key Handling & Secret Management
- **Threat Scenario:** Application master encryption keys or blockchain relayer private keys leak into client bundles, public git history, application logs, or error responses.
- **Security Mitigations:**
  1. **Envelope Encryption:** Every capture uses a unique ephemeral 256-bit Data Encryption Key (DEK). Stored files on IPFS are encrypted with AES-256-GCM. The DEK is encrypted with the master key (`MASTER_KEY_B64`).
  2. **Strict Environment Taxonomy:**
     - **Server-Only (Protected):** `TINYFISH_API_KEY`, `GEMINI_API_KEY`, `MASTER_KEY_B64`, `UID_HASH_SALT`, `PINATA_JWT`, `AMOY_RPC_URL`, `ANCHOR_PRIVATE_KEY`.
     - **Public (Client Safe):** Only variables explicitly prefixed with `NEXT_PUBLIC_` (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_REGISTRY_ADDRESS`, `NEXT_PUBLIC_CHAIN_ID`).
  3. **Startup Environment Validation:** One Zod schema validates all required variables at server initialization. Missing variables are printed by name only—never disclosing values.
  4. **Production Build Guards:** The build fails immediately if test/dev-mode flags are enabled (`TINYFISH_MODE=fixture`, `IPFS_FALLBACK=dev`, `CHAIN_MODE=mock`, `AI_FALLBACK=dev`).
  5. **Automated Secret Scanning:** Continuous Gitleaks scanning (`.gitleaks.toml`) runs on pre-push git hooks and CI builds to detect exposed keys or tokens.
  6. **Structured Log Masking:** All log output passes through redaction regexes that automatically mask private keys, JWTs, authorization headers, and bearer tokens.
