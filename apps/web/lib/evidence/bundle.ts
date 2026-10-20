import JSZip from "jszip";
import { EvidenceManifest } from "./manifest";

export interface BundleProofJson {
  chainId: number;
  network: string;
  contract: string;
  txHash: string;
  blockNumber: number;
  anchoredAt: string;
  root: string;
  manifestSha256: string;
  proof: string[];
  treeFormat: "openzeppelin-standard-v1";
  leafEncoding: ["bytes32"];
  batchCid: string;
}

export interface DecryptedArtifactEntry {
  filename: string;
  plaintextBuffer: Buffer;
  sha256: string;
}

export interface BundleOptions {
  manifest: EvidenceManifest;
  artifacts: DecryptedArtifactEntry[];
  proofJson?: BundleProofJson | null;
  aiAnalysisJson?: unknown | null;
  certificatePdfBuffer?: Buffer | null;
}

export function generateVerifyInstructions(manifest: EvidenceManifest, proofJson?: BundleProofJson | null): string {
  return `# Saakshi Evidence Verification Guide

This evidence archive was cryptographically created and preserved by **Saakshi (Team Eclipse, KRITICAL HACKS '26)**.

## Archive Contents
- **manifest.json**: Complete RFC 8785 canonical manifest of all captured artifacts and metadata.
- **proof.json**: Cryptographic Merkle inclusion proof and on-chain anchoring details on Polygon Amoy.
- **certificate_part_a_draft.pdf**: Draft Certificate under Section 63(4) of the Bharatiya Sakshya Adhiniyam, 2023 (BSA).
- **ai_analysis.json**: AI-extracted factual summary, parties, and complaint drafting aid (not part of the anchored manifest).
- **artifacts/**: Plaintext artifacts as recorded by the TinyFish browser and agent.

## How to Verify Offline

### 1. Verify Artifact Hashes
Every file in \`artifacts/\` must match its exact SHA-256 hash specified in \`manifest.json\`:
\`\`\`bash
# On macOS / Linux:
shasum -a 256 artifacts/*
\`\`\`

### 2. Verify Manifest Hash
Canonicalize \`manifest.json\` per RFC 8785 (JCS) and compute SHA-256. The resulting hash must equal:
- Manifest Hash: \`${proofJson?.manifestSha256 || "Pending anchoring"}\`

### 3. Verify Blockchain Timestamp & Merkle Inclusion
- Network: Polygon Amoy (${proofJson?.chainId || 80002})
- Registry Contract: \`${proofJson?.contract || "Not yet anchored"}\`
- Transaction Hash: \`${proofJson?.txHash || "Not yet anchored"}\`
- Merkle Root: \`${proofJson?.root || "Not yet anchored"}\`

You can verify the inclusion proof by calling \`verify(manifestHash, proof, root)\` on the EvidenceRegistry smart contract via Polygonscan or any Amoy RPC node.
`;
}

/**
 * Builds a downloadable ZIP archive bundle containing all evidence files.
 */
export async function buildEvidenceBundleZip(options: BundleOptions): Promise<Buffer> {
  const zip = new JSZip();

  // 1. Add canonical manifest.json
  zip.file("manifest.json", JSON.stringify(options.manifest, null, 2));

  // 2. Add proof.json if available
  if (options.proofJson) {
    zip.file("proof.json", JSON.stringify(options.proofJson, null, 2));
  }

  // 3. Add AI analysis if available
  if (options.aiAnalysisJson) {
    zip.file("ai_analysis.json", JSON.stringify(options.aiAnalysisJson, null, 2));
  }

  // 4. Add Section 63(4) Draft Certificate PDF if generated
  if (options.certificatePdfBuffer) {
    zip.file("certificate_part_a_draft.pdf", options.certificatePdfBuffer);
  }

  // 5. Add VERIFY.md instructions
  zip.file("VERIFY.md", generateVerifyInstructions(options.manifest, options.proofJson));

  // 6. Add plaintext artifacts in an artifacts/ directory
  const artifactsFolder = zip.folder("artifacts");
  if (artifactsFolder) {
    for (const art of options.artifacts) {
      artifactsFolder.file(art.filename, art.plaintextBuffer);
    }
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return zipBuffer;
}
