# Saakshi Evidence Verification Guide

This document describes how to independently verify Saakshi digital evidence archives—both online in the browser without trusting Saakshi's servers, and completely offline via CLI scripts.

---

## 1. Cryptographic Architecture

Every piece of evidence preserved by Saakshi is protected through an immutable cryptographic chain:

```
[Raw Files] (Screenshots, PDFs, DOM HTML, Network Logs)
    │
    ▼ (WebCrypto / Node.js crypto SHA-256)
[Artifact SHA-256 Fingerprints]
    │
    ▼
[manifest.json] (Contains metadata, timestamps, artifact SHA-256 hashes)
    │
    ▼ (RFC 8785 JSON Canonicalization Scheme - JCS)
[manifestSha256]
    │
    ▼ (OpenZeppelin StandardMerkleTree ["bytes32"])
[Merkle Batch Root]
    │
    ▼ (Polygon Amoy / Ethereum RPC - EvidenceRegistry.sol)
[On-Chain Anchor Transaction & Block Timestamp]
```

---

## 2. In-Browser Verification (`/verify`)

You can verify any artifact or ZIP evidence bundle directly in your web browser by navigating to `/verify`:

### Trustless Bundle Mode (Zero Saakshi API Calls)
When you drop a `.zip` evidence bundle into `/verify`:
1. **Local ZIP Unpacking**: The browser unpacks `manifest.json`, `proof.json`, and all preserved files in `artifacts/` using JavaScript (`jszip`).
2. **Local SHA-256 Computation**: Every artifact's SHA-256 is computed using W3C standard `crypto.subtle.digest("SHA-256")`. No file bytes are ever uploaded to any server.
3. **Canonical Manifest Verification**: The browser canonicalizes `manifest.json` using RFC 8785 JCS and recomputes `manifestSha256`.
4. **Security Validation**: The browser confirms that `proof.json` points to the authorized contract (`NEXT_PUBLIC_REGISTRY_ADDRESS`) and chain (`NEXT_PUBLIC_CHAIN_ID`). If a proof points to an untrusted contract or chain, verification fails with **ALTERED** / Security Error.
5. **Merkle Proof Verification**: StandardMerkleTree in JavaScript verifies that `manifestSha256` is an authentic leaf in the Merkle root.
6. **Direct Blockchain RPC Call**: The browser connects directly to the blockchain RPC (e.g. Polygon Amoy or local node) using `ethers.JsonRpcProvider` and calls `EvidenceRegistry.verify(manifestHash, proof, root)`.
7. **Result**: Zero calls are made to Saakshi's API. The on-chain block timestamp is displayed in IST and UTC.

### Single-File Mode (Loose Screenshots, PDFs, or Text)
When dropping an individual file:
1. The browser computes its SHA-256 locally.
2. The 64-character hash is sent to `/api/verify/[sha256]` to retrieve the Merkle proof and anchor metadata. (Files are never uploaded).
3. The browser validates contract address and chain ID.
4. The browser calls `EvidenceRegistry.verify()` directly on-chain via the RPC.

---

## 3. The 5 Verification Result States

| State | Badge Color | Meaning & Trigger Condition |
|---|---|---|
| **VERIFIED** | Green | The file's hash is in an authentic manifest, the Merkle proof passes, and the Merkle root is anchored on-chain. Displays block number, block time (IST + UTC), and transaction hash. |
| **NOT FOUND** | Grey | The hash is not recorded in Saakshi's index. "Not found in Saakshi's records. This file was not captured by Saakshi, or it has been changed." |
| **ALTERED** | Red | In bundle mode, a file's hash differs from the manifest entry, or the proof was rejected on-chain, or the proof points to a rogue contract/chain. "This file has been changed since it was captured." |
| **NOT YET ANCHORED** | Amber | The capture exists in records or bundle, but has not yet been sealed in an on-chain batch. |
| **CHAIN CHECK FAILED** | Amber | The blockchain RPC was unreachable or timed out. A fallback RPC is tried automatically, and a "Retry Blockchain Check" button is offered. |

---

## 4. Offline / CLI Verification (`scripts/verify.ts`)

Any third party (auditors, forensic analysts, legal counsel) can verify an evidence bundle without running the Saakshi web application:

### Run Verification via npm
```bash
npm run verify:bundle path/to/evidence_bundle.zip
```
Or directly via `ts-node`:
```bash
npx ts-node -r tsconfig-paths/register scripts/verify.ts path/to/evidence_bundle.zip
```

### Verification Steps Executed by CLI:
1. Extracts `manifest.json` and artifact files.
2. Canonicalizes `manifest.json` per RFC 8785 and validates `manifestSha256`.
3. Verifies each artifact file matches its declared SHA-256 fingerprint.
4. Validates Merkle inclusion proof against `proof.json`.
5. Queries `EvidenceRegistry.verify()` on the configured blockchain RPC to confirm on-chain anchoring.

### Tampering Demonstration
If even a single byte of any artifact is modified, the verifier halts immediately:
```
[3] Verifying Individual Plaintext Artifact Hashes:
    ❌ Artifact art_screenshot_fullpage (fullpage_screenshot): MISMATCH!
       Expected: 8d1feea2696653e2a13aa2b1eb381d140df6474a76a395a7e4d38b9d390a5952
       Computed: 2f3d7a94191c9c14509a9429aac8faa9ea2ed41563f08eb344d80114d40c02dd
    ✅ Artifact art_pdf_export (page_pdf): MATCH
    ✅ Artifact art_dom_html (dom_html): MATCH

❌ ARTIFACT TAMPERING DETECTED: Files have been modified since capture!
```

---

## 5. Public Capture Certificate (`/v/[id]`)

Every capture has a public certificate page at `/v/[id]` designed for court and public inspection:
- **Privacy by Default**: The original target URL is hidden (`[Target URL hidden by owner for privacy]`) unless the evidence owner opted into public disclosure.
- **Fingerprint Manifest**: Displays the capture ID, server capture timestamp (IST & UTC), on-chain block number, and SHA-256 fingerprints of all preserved artifacts.
- **QR Code**: Scannable QR code directing to the permalink certificate.
- **Scoped Verifier**: An in-page drop zone allowing anyone to drop a loose file to confirm whether it matches an authentic artifact in that specific capture.
