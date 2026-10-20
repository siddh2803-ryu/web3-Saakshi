import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { createHash } from "crypto";
import canonicalize from "canonicalize";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { ethers } from "ethers";

/**
 * Offline Evidence Verifier Script for Saakshi Evidence Bundles
 * Usage: npx ts-node scripts/verify.ts <path-to-unzipped-bundle-or-manifest>
 */

function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").toLowerCase();
}

async function verifyBundle(targetDir: string) {
  console.log(`\n======================================================`);
  console.log(`SAAKSHI FORENSIC EVIDENCE OFFLINE VERIFIER`);
  console.log(`Target: ${targetDir}`);
  console.log(`======================================================\n`);

  const manifestPath = path.join(targetDir, "manifest.json");
  const proofPath = path.join(targetDir, "proof.json");
  const artifactsDir = path.join(targetDir, "artifacts");

  if (!fs.existsSync(manifestPath)) {
    console.error("❌ Error: manifest.json not found in target path");
    process.exit(1);
  }

  // 1. Parse manifest
  const manifestRaw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  console.log(`[1] Manifest Loaded`);
  console.log(`    - Capture ID: ${manifest.captureId}`);
  console.log(`    - Target URL: ${manifest.target.url}`);
  console.log(`    - Server Capture Time: ${manifest.time.serverFinishedAt}\n`);

  // 2. Canonicalize Manifest and compute SHA-256
  const canonicalManifest = canonicalize(manifest);
  if (!canonicalManifest) {
    console.error("❌ Error: Failed to canonicalize manifest with RFC 8785");
    process.exit(1);
  }
  const manifestHash = sha256Buffer(Buffer.from(canonicalManifest, "utf8"));
  console.log(`[2] RFC 8785 Canonical Manifest Hash computed:`);
  console.log(`    SHA-256: ${manifestHash}\n`);

  // 3. Verify Artifact Plaintext Hashes if artifacts/ directory exists
  if (fs.existsSync(artifactsDir)) {
    console.log(`[3] Verifying Individual Plaintext Artifact Hashes:`);
    const files = fs.readdirSync(artifactsDir);
    let allArtifactsPass = true;

    for (const art of manifest.artifacts) {
      const matchedFile = files.find((f) => f.startsWith(`${art.id}_`));
      if (!matchedFile) {
        console.warn(`    ⚠️  Artifact ${art.id} (${art.kind}) not present in artifacts/ folder`);
        continue;
      }

      const filePath = path.join(artifactsDir, matchedFile);
      const fileBytes = fs.readFileSync(filePath);
      const computedHash = sha256Buffer(fileBytes);

      if (computedHash === art.sha256.toLowerCase()) {
        console.log(`    ✅ Artifact ${art.id} (${art.kind}): MATCH`);
      } else {
        console.error(`    ❌ Artifact ${art.id} (${art.kind}): MISMATCH!`);
        console.error(`       Expected: ${art.sha256}`);
        console.error(`       Computed: ${computedHash}`);
        allArtifactsPass = false;
      }
    }

    if (!allArtifactsPass) {
      console.error("\n❌ ARTIFACT TAMPERING DETECTED: Files have been modified since capture!\n");
    } else {
      console.log(`\n    All artifact fingerprints match manifest declarations.\n`);
    }
  }

  // 4. Verify Merkle Proof against Polygon Blockchain
  if (fs.existsSync(proofPath)) {
    console.log(`[4] Verifying Blockchain Merkle Inclusion Proof:`);
    const proofJson = JSON.parse(fs.readFileSync(proofPath, "utf8"));

    const leafHash = `0x${manifestHash}`;
    console.log(`    - Root: ${proofJson.root}`);
    console.log(`    - Expected Manifest Hash: ${proofJson.manifestSha256}`);

    // Verify Merkle Proof in JS
    const isValidMerkle = StandardMerkleTree.verify(
      proofJson.root,
      ["bytes32"],
      [leafHash],
      proofJson.proof
    );

    if (isValidMerkle) {
      console.log(`    ✅ Merkle Inclusion Proof: VALID (Leaf included in Merkle root)`);
    } else {
      console.error(`    ❌ Merkle Inclusion Proof: INVALID!`);
    }

    // Verify On-Chain via Polygon RPC
    if (proofJson.contract && proofJson.contract !== "0x0000000000000000000000000000000000000000") {
      try {
        console.log(`\n[5] Calling Polygon Amoy RPC (${proofJson.contract}):`);
        const rpc = new ethers.JsonRpcProvider("https://rpc-amoy.polygon.technology");
        const abi = [
          "function verify(bytes32 manifestHash, bytes32[] calldata proof, bytes32 root) external view returns (bool ok, uint64 anchoredAt)",
        ];
        const contract = new ethers.Contract(proofJson.contract, abi, rpc);
        const [ok, timestamp] = await contract.verify(
          leafHash,
          proofJson.proof,
          proofJson.root
        );

        if (ok) {
          const anchoredDate = new Date(Number(timestamp) * 1000);
          console.log(`    ✅ Smart Contract State: VERIFIED ON-CHAIN!`);
          console.log(`       Anchored Timestamp: ${anchoredDate.toISOString()}`);
        } else {
          console.error(`    ❌ Smart Contract returned false for inclusion.`);
        }
      } catch (rpcErr) {
        console.warn(`    ⚠️  Could not reach live Polygon Amoy RPC:`, rpcErr);
      }
    }
  }

  console.log(`\n======================================================`);
  console.log(`VERIFICATION COMPLETE`);
  console.log(`======================================================\n`);
}

const target = process.argv[2] || "./";
verifyBundle(target).catch(console.error);
