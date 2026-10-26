# Saakshi: Implementation Plan & Task List

## Overview
Saakshi is an AI witness for the internet that provides agentic, tamper-proof, court-ready web evidence for Indian jurisprudence (Bharatiya Sakshya Adhiniyam, 2023 s.63(4)) and global digital rights.

## Phased Execution Roadmap

### Phase 0: Scaffolding & Base Monorepo
- Initialize Next.js 14/15 App Router project in `apps/web` with TypeScript strict, Tailwind CSS, Lucide icons, fonts, shadcn components.
- Initialize Hardhat project in `contracts/` with TypeScript, OpenZeppelin contracts, `@openzeppelin/merkle-tree`, ethers v6.
- Set up root configuration, `.env.example`, `.env.local` handling.
- Base layout, styling tokens (`#1E1B4B`, `#4F46E5`, `#F59E0B`, `#0D9488`, `#E11D48`, `#64748B`, `#F1F5F9`), landing page with 3-step explainer.
- Firebase integration (Auth client + Admin SDK fallback/emulator-aware).
- Commit: `chore: scaffold Next.js app, Hardhat workspace, Firebase auth and CI`

### Phase 1: Sandbox "Chirp" Platform & Agent Capture
- `/sandbox/post/[slug]` fictional social platform ("Chirp") with author, handle, content, media, comments.
- `/sandbox/admin` protected by `SANDBOX_ADMIN_SECRET` to edit content and simulate deletions (HTTP 404 with "This post has been removed").
- `lib/tinyfish/agent.ts` with async runner, status poller, cancellation, step screenshots base64 extraction.
- `POST /api/captures` with input validation, URL check (rejecting localhost/private IP), quota checks.
- `GET /api/captures/:id` proxying run status, streaming URL, step counts.
- `POST /api/webhooks/tinyfish` handling agent run notifications.
- Live capture page with streaming preview iframe, progress timeline, step filmstrip.
- Fixture mode recordings in `fixtures/` for test and dev workflows.
- Commit: `feat(capture): TinyFish agent capture with live preview and step trail`

### Phase 2: Browser API & Fetch Artifacts
- `lib/tinyfish/browser.ts` utilizing `playwright-core` over CDP: fullpage PNG screenshot, PDF render, network responses log, TLS security certificate details, DOM HTML. Guaranteed session cleanup in `finally`.
- `lib/tinyfish/fetch.ts` for clean markdown extraction and metadata.
- Integrate both into the capture finalize pipeline.
- Commit: `feat(capture): full-page browser capture and clean text via TinyFish Browser and Fetch`

### Phase 3: Evidence Engine & Cryptography
- `lib/evidence/hash.ts` (SHA-256 over plaintext bytes).
- `lib/evidence/canonical.ts` (RFC 8785 JSON Canonicalization Scheme - JCS).
- `lib/evidence/normalize.ts` (Unicode NFC, whitespace normalization for stable diffing).
- `lib/evidence/manifest.ts` (`saakshi.evidence/v1` specification).
- `lib/evidence/crypto.ts` (Envelope encryption: random 256-bit DEK, AES-256-GCM, IV + authTag, master key wrapping).
- `lib/evidence/ipfs.ts` (Pinata upload and CID retrieval with mock/mockless fallback).
- `lib/evidence/bundle.ts` (ZIP bundle generation with JSZip).
- `GET /api/captures/:id/bundle` and `GET /api/captures/:id/artifacts/:artifactId`.
- Commit: `feat(evidence): SHA-256 manifest, envelope encryption, IPFS storage and bundle export`

### Phase 4: Smart Contract & Merkle Anchoring
- `contracts/contracts/EvidenceRegistry.sol` (OpenZeppelin AccessControl, MerkleProof, anchorRoot, verify, logCustody).
- Hardhat tests covering 100% of contract logic.
- `lib/evidence/merkle.ts` using `@openzeppelin/merkle-tree` (StandardMerkleTree).
- `lib/chain/registry.ts` and `POST /api/captures/:id/anchor`.
- Commit: `feat(web3): EvidenceRegistry on Polygon Amoy with Merkle batch anchoring`

### Phase 5: Public Trustless Verification
- `/verify` with browser-side WebCrypto SHA-256 hashing (zero file upload required).
- Lookup in `publicProofs/{sha256}`.
- Direct public RPC `verify()` call to Polygon Amoy.
- `/v/[id]` public certificate proof summary.
- Offline verification guide (`VERIFY.md`) and `scripts/verify.ts`.
- Commit: `feat(verify): trustless public verification page`

### Phase 6: Watch with TinyFish Monitor
- `lib/tinyfish/monitor.ts` (page monitor creation, run-now, pause, resume, delete).
- `lib/watch/classify.ts` and `lib/watch/diff.ts` (NO_CHANGE, EDITED, DELETED, BLOCKED).
- `POST /api/captures/:id/watch` and `POST /api/watches/:id/check`.
- `POST /api/webhooks/monitor`.
- Auto-recapture triggering on edit/delete.
- Commit: `feat(watch): TinyFish Monitor edit and deletion detection with auto re-capture`

### Phase 7: Gemini AI Analysis & s.63(4) Certificate
- `lib/ai/gemini.ts` using `@google/genai` with Zod response schema.
- Hindi and English summaries and complaint drafts.
- Neutral, factual prompt with official reporting channels.
- `lib/pdf/certificate.tsx` drafting BSA 2023 s.63(4) Part A certificate with all artifact hashes, Merkle root, Polygon tx hash, and QR code.
- Commit: `feat(ai): Gemini evidence summary, complaint drafts and s.63(4) Part A draft PDF`

### Phase 8: Reposts, Cases, Custody & Share Links (P1)
- `lib/tinyfish/search.ts` and `POST /api/captures/:id/reposts`.
- Case grouping and custody logging with on-chain event emission.
- Expiring share links (`/s/[token]`).
- Commit: `feat: repost finder, cases, custody log and share links`

### Phase 9: Hardening, Tests & Documentation
- Comprehensive test suite (vitest + Hardhat).
- Complete README.md matching all rubric criteria.
- Verification and audit of environment variables and security constraints.
- Commit: `docs: README with TinyFish integration guide and architecture`
