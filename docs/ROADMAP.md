# Saakshi Implementation Roadmap & Build Plan

**Target:** KRITICAL HACKS '26 Finale (Offline Round: 28-29 Oct 2026)  
**Strategy:** Demo-first prioritization (PRD Section 19.1), hardening core P0 evidence paths, with clean offline fallbacks for unreliable venue Wi-Fi.

---

## 1. Unfinished Phases & Remaining Work Breakdown

### Phase 0: Scaffolding & Base Monorepo (COMPLETE - PENDING LIVE DEPLOY/CREDENTIALS)
| Task ID | Task Description | Size | Dependencies | Priority | Status |
|---|---|---|---|---|---|
| T0.1 | Add `.github/workflows/ci.yml` covering `npm run lint`, `tsc --noEmit`, `test:contracts`, `test:web`, and `npm run build`. | **S** | None | P0 | **DONE** (`77b3887`) |
| T0.2 | Pin Node 20 in `.nvmrc`, configure root scripts, add shadcn/ui components & Section 15 design tokens. | **S** | None | P0 | **DONE** (`d4d1a7a`) |
| T0.3 | Document Firebase & Vercel deployment guide in `docs/SETUP.md`. | **S** | None | P0 | **DONE** (`a145215`) |

### Phase 2: Full-Page Browser Capture & Clean Text (PARTIAL -> COMPLETE)
| Task ID | Task Description | Size | Dependencies | Priority |
|---|---|---|---|---|
| T2.1 | Re-verify standalone commit marker `feat(capture): full-page browser capture and clean text via TinyFish Browser and Fetch` in git history. | **S** | None | P0 |
| T2.2 | Perform live CDP test over real TinyFish Browser API once `TINYFISH_API_KEY` is supplied. | **S** | Credentials | P0 |

### Phase 4: Smart Contract & Merkle Anchoring (PARTIAL -> COMPLETE)
| Task ID | Task Description | Size | Dependencies | Priority |
|---|---|---|---|---|
| T4.1 | Fund ANCHOR_ROLE wallet with Polygon Amoy testnet POL (Chain ID 80002). | **S** | Amoy Faucet | P0 (Human) |
| T4.2 | Execute `npm run deploy:amoy` from `contracts/` to deploy `EvidenceRegistry.sol`. | **M** | T4.1 | P0 |
| T4.3 | Record deployed contract address in `NEXT_PUBLIC_REGISTRY_ADDRESS` and private key in `ANCHOR_PRIVATE_KEY`. | **S** | T4.2 | P0 |
| T4.4 | Verify contract source code on Polygonscan Amoy (`https://amoy.polygonscan.com`). | **S** | T4.2 | P0 |
| T4.5 | Commit with message `feat(web3): EvidenceRegistry on Polygon Amoy with Merkle batch anchoring`. | **S** | T4.3 | P0 |

### Phase 8: Reposts, Cases, Custody & Share Links (PARTIAL -> COMPLETE) [P1 - CUTTABLE]
| Task ID | Task Description | Size | Dependencies | Priority |
|---|---|---|---|---|
| T8.1 | Create dedicated `/s/[token]` route page redirecting to `/v/[id]?share=[token]` with expiration validation. | **S** | None | P1 |
| T8.2 | Build dedicated Cases grouping UI on `/dashboard` with case-level ZIP download. | **M** | None | P1 *(Cut if time runs out)* |
| T8.3 | Verify live on-chain `Custody` event emission on `EXPORT` and `SHARE`. | **S** | T4.3 | P1 |

### Phase 9: Hardening, Tests & Documentation (PARTIAL -> COMPLETE)
| Task ID | Task Description | Size | Dependencies | Priority |
|---|---|---|---|---|
| T9.1 | Add root `npm run smoke` command invoking `npx ts-node -r tsconfig-paths/register scripts/smoke.ts`. | **S** | None | P0 |
| T9.2 | Enforce production build failure in `next.config.mjs` if `NODE_ENV === "production"` and `TINYFISH_MODE === "fixture"`. | **S** | None | P0 |
| T9.3 | Add production-grade `firestore.rules` forbidding direct unauthorized client writes. | **S** | None | P0 |
| T9.4 | Update `README.md` with live deployed contract address and Polygonscan explorer links. | **S** | T4.3 | P0 |

### Phase 10: Demo Video, Social Post & Venue Readiness (HUMAN TASK)
| Task ID | Task Description | Size | Dependencies | Priority |
|---|---|---|---|---|
| T10.1 | Execute complete live smoke test on deployed web instance (`scripts/smoke.ts`). | **S** | T4.3, Vercel | P0 |
| T10.2 | Record screen capture demo walkthrough following `docs/DEMO.md` (2 to 3 minutes). | **M** | T10.1 | P0 (Human) |
| T10.3 | Draft & publish public social post (X/LinkedIn) with demo clip, GitHub link, and plain-language pitch. | **S** | T10.2 | P0 (Human) |
| T10.4 | Prepare offline demo fallback bundle (pre-recorded video + fixture screenshots) on demo laptop. | **S** | T10.2 | P0 (Human) |

---

## 2. Overall Build Order (Optimized for Live Demo Flow)

The build order follows the exact live judge walkthrough journey (PRD Section 19.1 & `docs/DEMO.md`):

```
Demo Flow:
Capture (/capture/new)
  ↳ Streaming Live Preview & Filmstrip
    ↳ Plaintext Artifacts & SHA-256 Hashes
      ↳ Merkle Batching & On-Chain Anchor
        ↳ Client-Side Verify (Green / Red)
          ↳ Watch Deletion Detection (/sandbox/admin -> 404 -> Check Now -> Diff)
            ↳ Gemini Summary & s.63(4) Part A PDF Certificate
```

### Stage 1: Build & Script Hardening (Immediate)
- **Task 1 (T9.1)**: Add `npm run smoke` in root `package.json` with `tsconfig-paths` registration to guarantee 1-command verification.
- **Task 2 (T9.2)**: Enforce production build failure on `TINYFISH_MODE=fixture` in `next.config.mjs` (FR-7.8).
- **Task 3 (T9.3)**: Create `firestore.rules` to document database security constraints.
- **Task 4 (T0.1)**: Add `.github/workflows/ci.yml` for automated CI validation.

### Stage 2: Web3 Testnet Anchoring (P0 Demo Core)
- **Task 5 (T4.1 & T4.2)**: Deploy `EvidenceRegistry.sol` to Polygon Amoy testnet.
- **Task 6 (T4.3 & T4.4)**: Update `.env.local` and `README.md` with the verified contract address.
- **Task 7 (T4.5)**: Re-check all Phase 4 criteria and commit `feat(web3): EvidenceRegistry on Polygon Amoy with Merkle batch anchoring`.

### Stage 3: Verification & Deletion Watch Polish
- **Task 8**: Validate `/verify` against the newly deployed Amoy contract address via live `eth_call`.
- **Task 9**: Test the live sandbox deletion flow:
  1. Capture `/sandbox/post/internship-scam-alert`
  2. Anchor on-chain
  3. Delete post in `/sandbox/admin` (returns 404)
  4. Trigger "Check Now" -> assert `DELETED` detected, diff calculated, auto re-capture triggered.

### Stage 4: P1 Features & Share Link Route (Can be cut if time is tight)
- **Task 10 (T8.1)**: Add dedicated `/s/[token]` route handler.
- **Task 11 (T8.2)**: Refine case grouping UI if time permits.

### Stage 5: Event Readiness & Presentation (Phase 10 Human Tasks)
- **Task 12**: Run `npm run smoke` on the final build.
- **Task 13**: Team records 2-3 minute demo video following `docs/DEMO.md`.
- **Task 14**: Team publishes public social post.
