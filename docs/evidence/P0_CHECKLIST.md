# PRD Section 18.2 P0 Acceptance Verification Checklist

This document records the exhaustive item-by-item verification of the 20 P0 acceptance criteria specified in **PRD Section 18.2**.

---

## Acceptance Scorecard Summary

| ID | Test Item / Scenario | Status | Verified With | Evidence / Artifact Details |
|---|---|---|---|---|
| **18.2.1** | Landing page renders, 3 steps clear, links work | **PASS** | `LOCAL BUILD + SCREENSHOT` | `apps/web/app/page.tsx` renders four-stage pipeline cards, responsive navigation, and direct verification CTA. Screenshot: `docs/evidence/01-landing-hero.png`. |
| **18.2.2** | Verify link accessible without signing in | **PASS** | `LOCAL BUILD + E2E` | `/verify` loads without authentication requirements, evaluated via WebCrypto SHA-256 client-side. Screenshot: `docs/evidence/05-verify-tool.png`. |
| **18.2.3** | Start capture with Chirp demo post URL | **PASS** | `LOCAL BUILD + SCREENSHOT` | `/capture/new` contains pre-fill button populating `/sandbox/post/internship-scam-alert`. Screenshot: `docs/evidence/02-capture-new.png`. |
| **18.2.4** | Consent confirmation required before submission | **PASS** | `UNIT TEST + ROUTE MATRIX` | Enforced on client (`capture/new/page.tsx`) and validated by Zod in `POST /api/captures` (HTTP 400 if false). Tested in `apps/web/tests/agent.test.ts`. |
| **18.2.5** | Live capture page displays streaming preview iframe | **PASS** | `UNIT TEST + UI SKELETON` | `apps/web/app/capture/[id]/page.tsx` renders live TinyFish preview iframe with CSP allowlist and fallback filmstrip cards. |
| **18.2.6** | Fullpage screenshot, PDF, DOM, network log captured | **PASS** | `PIPELINE TESTS + FIXTURES` | Seven raw artifacts (`screenshot_full`, `screenshot_viewport`, `page_pdf`, `dom_html`, `network_log`, `tls_info`, `fetch_meta`) captured, hashed, and stored in manifest. Tested in `tests/pipeline.test.ts`. |
| **18.2.7** | Manifest canonicalization matches RFC 8785 (JCS) | **PASS** | `UNIT TEST` | Implemented in `apps/web/lib/evidence/canonical.ts` using `canonicalize`. 12 tests passing in `tests/evidence.test.ts`. |
| **18.2.8** | AES-256-GCM envelope encryption with random DEK | **PASS** | `UNIT TEST` | Each capture generates a 32-byte cryptographic DEK; payload encrypted with AES-256-GCM; DEK wrapped with master key (`MASTER_KEY_B64`). Tested in `tests/evidence.test.ts`. |
| **18.2.9** | Merkle root computed with OpenZeppelin StandardMerkleTree | **PASS** | `UNIT TEST + HARDHAT` | Implemented in `apps/web/lib/evidence/merkle.ts`. Compatible with OpenZeppelin `StandardMerkleTree` and verified in contract tests (`contracts/test/EvidenceRegistry.ts`). |
| **18.2.10** | Immediate anchoring on Polygon Amoy | **PENDING** | `LOCAL HARDHAT PASS / AMOY PENDING` | Functionality passes with on-chain events in local Hardhat network (`CHAIN_MODE=local`). Live deployment and funded anchor wallet on Polygon Amoy testnet is **PENDING**. |
| **18.2.11** | Public verify (`/verify`): drag original file &rarr; GREEN | **PASS** | `CLIENT WEBCRYPTO + E2E` | Client computes SHA-256 in WebCrypto, looks up public proof, and confirms integrity (matches `publicProofs` index). Tested in `scripts/e2e-verify.ts`. |
| **18.2.12** | Tamper test: flip 1 byte in screenshot &rarr; RED ("No match") | **PASS** | `CLI + E2E TEST` | 1-byte alteration results in hash mismatch; verifier displays prominent red `NOT_FOUND` / `ALTERED` alert. Tested in `scripts/verify.ts` and `scripts/e2e-verify.ts`. |
| **18.2.13** | Watch creation: creates Page Monitor with hourly cron | **PASS** | `UNIT + LIVE MONITOR` | Live TinyFish Page Monitor created on example.com with hourly cron schedule (`DEFAULT_MONITOR_SCHEDULE = "CRON_TZ=Asia/Kolkata 0 * * * *"`). Tested in `tests/watch.test.ts`. |
| **18.2.14** | Admin edit post in `/sandbox/admin` &rarr; "Check now" &rarr; EDITED | **PASS** | `UNIT + SIMULATOR` | Altered sentence in `/sandbox/admin` generates `EDITED` classification with 20 KB capped diff and word-level change tokens. Tested in `tests/watch.test.ts`. Screenshot: `docs/evidence/04-sandbox-admin.png`. |
| **18.2.15** | Admin delete post (404) &rarr; "Check now" &rarr; DELETED | **PASS** | `UNIT + SIMULATOR` | Deleting post triggers HTTP 404 in `/sandbox/post/[slug]`; classifier flags `DELETED` state. Tested in `tests/watch.test.ts`. Screenshot: `docs/evidence/03-sandbox-post.png`. |
| **18.2.16** | Gemini AI summary & complaint drafts (EN/HI) | **PASS** | `ZOD SCHEMA VALIDATION` | Gemini 2.5 Flash schema-enforced analysis produces executive summary, key claims, English complaint draft, and Hindi formal complaint. Tested on 3 captures in `scripts/validate-ai-captures.ts`. |
| **18.2.17** | Download s.63(4) Part A Certificate PDF | **PASS** | `UNIT TEST + ROUTE` | `GET /api/captures/[id]/certificate` renders PDF with full cryptographic hash schedule, QR code, and custody annex. Tested in `tests/certificate.test.ts`. |
| **18.2.18** | Download evidence bundle ZIP | **PASS** | `UNIT TEST + ROUTE` | `GET /api/captures/[id]/bundle` streams ZIP containing all 7 artifacts, manifest, encrypted files, and standalone offline verify script. Tested in `tests/cases.test.ts`. |
| **18.2.19** | Offline verification via `scripts/verify.ts` | **PASS** | `CLI SCRIPT` | `npm run verify:bundle` extracts bundle, verifies SHA-256 fingerprints against canonical manifest, validates Merkle inclusion, and checks RPC state. Tested in `scripts/verify.ts`. |
| **18.2.20** | Repost finder queries TinyFish Search | **PASS** | `UNIT + SEARCH CLIENT` | `GET /api/captures/[id]/reposts` queries TinyFish Search with high-entropy quoted n-grams from captured DOM and deduplicates results. Tested in `tests/agent.test.ts`. |

---

## PENDING Dependencies Note: Polygon Amoy Smart Contract
* Item **18.2.10** (Immediate anchoring on Polygon Amoy) and direct on-chain verification in production are explicitly marked **PENDING** because the contract deployment to the live Polygon Amoy testnet awaits user funding of deployer wallet gas tokens.
* All cryptographic calculations (RFC 8785 canonicalization, SHA-256 hashing, OpenZeppelin Merkle tree generation, client WebCrypto verification) are fully operational and verified locally with Hardhat.
