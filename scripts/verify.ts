import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.chain-local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { createHash } from "crypto";
import canonicalize from "canonicalize";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { ethers } from "ethers";
import JSZip from "jszip";

/**
 * Forensic Evidence Verifier Script for Saakshi Evidence Bundles
 * Usage: npx ts-node scripts/verify.ts <path-to-unzipped-bundle-or-zip-file>
 */

function sha256Buffer(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex").toLowerCase();
}

interface LoadedBundle {
  manifestRaw: string;
  proofRaw?: string;
  getArtifactBytes: (filename: string) => Promise<Buffer | null>;
  listArtifactFiles: () => Promise<string[]>;
}

async function loadBundleSource(target: string): Promise<LoadedBundle> {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    const manifestPath = path.join(target, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`manifest.json not found in ${target}`);
    }
    const manifestRaw = fs.readFileSync(manifestPath, "utf8");
    const proofPath = path.join(target, "proof.json");
    const proofRaw = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, "utf8") : undefined;
    const artifactsDir = path.join(target, "artifacts");

    return {
      manifestRaw,
      proofRaw,
      getArtifactBytes: async (filename: string) => {
        const fullPath = path.join(artifactsDir, filename);
        if (fs.existsSync(fullPath)) {
          return fs.readFileSync(fullPath);
        }
        return null;
      },
      listArtifactFiles: async () => {
        if (!fs.existsSync(artifactsDir)) return [];
        return fs.readdirSync(artifactsDir);
      },
    };
  }

  // Handle ZIP file
  const zipBytes = fs.readFileSync(target);
  const zip = await JSZip.loadAsync(zipBytes);

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error(`manifest.json not found in ZIP bundle ${target}`);
  }
  const manifestRaw = await manifestFile.async("string");

  const proofFile = zip.file("proof.json");
  const proofRaw = proofFile ? await proofFile.async("string") : undefined;

  return {
    manifestRaw,
    proofRaw,
    getArtifactBytes: async (filename: string) => {
      const entry = zip.file(`artifacts/${filename}`) || zip.file(filename);
      if (!entry) return null;
      const u8 = await entry.async("uint8array");
      return Buffer.from(u8);
    },
    listArtifactFiles: async () => {
      const files: string[] = [];
      zip.forEach((relPath, entry) => {
        if (!entry.dir && relPath.startsWith("artifacts/")) {
          files.push(path.basename(relPath));
        }
      });
      return files;
    },
  };
}

export async function verifyBundle(target: string): Promise<boolean> {
  console.log(`\n======================================================`);
  console.log(`SAAKSHI FORENSIC EVIDENCE OFFLINE VERIFIER`);
  console.log(`Target: ${target}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(target)) {
    console.error(`❌ Error: Target not found at ${target}`);
    return false;
  }

  const bundle = await loadBundleSource(target);

  // 1. Parse manifest
  let manifest: any;
  try {
    manifest = JSON.parse(bundle.manifestRaw);
  } catch (err) {
    console.error("❌ Error: Invalid manifest.json JSON syntax");
    return false;
  }

  console.log(`[1] Manifest Loaded`);
  console.log(`    - Capture ID: ${manifest.captureId}`);
  console.log(`    - Target URL: ${manifest.target?.url || "(hidden)"}`);
  console.log(`    - Server Capture Time: ${manifest.time?.serverFinishedAt || manifest.time?.created}\n`);

  // 2. Canonicalize Manifest and compute SHA-256 via RFC 8785
  const canonicalManifest = canonicalize(manifest);
  if (!canonicalManifest) {
    console.error("❌ Error: Failed to canonicalize manifest with RFC 8785");
    return false;
  }
  const manifestHash = sha256Buffer(Buffer.from(canonicalManifest, "utf8"));
  console.log(`[2] RFC 8785 Canonical Manifest Hash computed:`);
  console.log(`    SHA-256: ${manifestHash}\n`);

  // 3. Verify Artifact Plaintext Hashes
  const artifactFiles = await bundle.listArtifactFiles();
  let allArtifactsPass = true;

  if (manifest.artifacts && manifest.artifacts.length > 0) {
    console.log(`[3] Verifying Individual Plaintext Artifact Hashes:`);
    for (const art of manifest.artifacts) {
      const matchedName = artifactFiles.find(
        (f) =>
          f === art.filename ||
          f === `${art.id}_${art.kind}` ||
          f === art.id ||
          f.startsWith(`${art.id}.`) ||
          f.startsWith(`${art.id}_`)
      );

      if (!matchedName) {
        console.warn(`    ⚠️  Artifact ${art.id} (${art.kind}) not present in artifacts bundle`);
        continue;
      }

      const fileBytes = await bundle.getArtifactBytes(matchedName);
      if (!fileBytes) {
        console.warn(`    ⚠️  Could not read bytes for ${matchedName}`);
        continue;
      }

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
      return false;
    } else {
      console.log(`\n    All checked artifact fingerprints match manifest declarations.\n`);
    }
  }

  // 4. Verify Proof
  if (!bundle.proofRaw) {
    console.warn("⚠️  proof.json not found in bundle. Capture may not be anchored yet.");
    return allArtifactsPass;
  }

  const proofJson = JSON.parse(bundle.proofRaw);
  console.log(`[4] Verifying Blockchain Merkle Inclusion Proof:`);
  console.log(`    - Root: ${proofJson.root}`);
  console.log(`    - Manifest Hash: ${proofJson.manifestSha256}`);
  console.log(`    - Chain ID: ${proofJson.chainId}`);
  console.log(`    - Contract: ${proofJson.contract}`);

  // Check manifest hash matches proof declaration
  if (proofJson.manifestSha256.toLowerCase() !== manifestHash.toLowerCase()) {
    console.error(`❌ Manifest Hash mismatch! Manifest JCS hash is ${manifestHash}, but proof.json declares ${proofJson.manifestSha256}`);
    return false;
  }

  // Security check: Verify proof contract and chain match expected deployment if configured
  const expectedContract = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  if (expectedContract && expectedContract !== "0x0000000000000000000000000000000000000000") {
    if (proofJson.contract.toLowerCase() !== expectedContract.toLowerCase()) {
      console.error(`❌ SECURITY ERROR: This proof points to a different contract (${proofJson.contract}) than the official deployment (${expectedContract})!`);
      return false;
    }
  }

  const expectedChainId = process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID;
  if (expectedChainId) {
    if (Number(proofJson.chainId) !== Number(expectedChainId)) {
      console.error(`❌ SECURITY ERROR: This proof points to a different chain ID (${proofJson.chainId}) than configured (${expectedChainId})!`);
      return false;
    }
  }

  // Verify Merkle Proof in JS
  const leafHash = `0x${manifestHash}`;
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
    return false;
  }

  // 5. Verify On-Chain via RPC
  if (proofJson.contract && proofJson.contract !== "0x0000000000000000000000000000000000000000") {
    const rpcUrl =
      process.env.RPC_URL ||
      process.env.NEXT_PUBLIC_RPC_URL ||
      process.env.AMOY_RPC_URL ||
      process.env.NEXT_PUBLIC_AMOY_RPC_URL ||
      "https://polygon-amoy-bor-rpc.publicnode.com";

    try {
      console.log(`\n[5] Calling Blockchain RPC at ${rpcUrl}:`);
      const rpc = new ethers.JsonRpcProvider(rpcUrl);
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
        console.log(`       Block Timestamp: ${Number(timestamp)}`);
      } else {
        console.error(`    ❌ Smart Contract returned false for Merkle root inclusion.`);
        return false;
      }
    } catch (rpcErr) {
      console.warn(`    ⚠️  Could not reach live RPC at ${rpcUrl}:`, rpcErr);
      return false;
    }
  }

  console.log(`\n======================================================`);
  console.log(`🎉 VERIFICATION COMPLETE: ALL CHECKS PASSED`);
  console.log(`======================================================\n`);
  return true;
}

if (require.main === module) {
  const target = process.argv[2] || "./";
  verifyBundle(target)
    .then((pass) => {
      process.exit(pass ? 0 : 1);
    })
    .catch((err) => {
      console.error("Verification script error:", err);
      process.exit(1);
    });
}