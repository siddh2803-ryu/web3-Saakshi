import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import canonicalize from "canonicalize";
import { createHash } from "crypto";

function computeSha256(data: Buffer | string): string {
  const hash = createHash("sha256");
  if (typeof data === "string") {
    hash.update(data, "utf8");
  } else {
    hash.update(data);
  }
  return hash.digest("hex").toLowerCase();
}

async function checkBundle(zipPath: string): Promise<boolean> {
  if (!zipPath) {
    console.error("Usage: npm run check:bundle <path-to-bundle.zip>");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), zipPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`\n=== Saakshi Bundle Integrity Check ===`);
  console.log(`Bundle: ${resolvedPath}\n`);

  const zipData = fs.readFileSync(resolvedPath);
  const zip = await JSZip.loadAsync(zipData);

  let allPassed = true;

  // 1. Check manifest.json
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    console.error("[FAIL] manifest.json is missing from bundle archive.");
    return false;
  }
  const manifestText = await manifestFile.async("text");
  let manifest: any;
  try {
    manifest = JSON.parse(manifestText);
    console.log(`[PASS] manifest.json parsed successfully (schema: ${manifest.schema}, captureId: ${manifest.captureId})`);
  } catch (err) {
    console.error("[FAIL] manifest.json contains invalid JSON:", err);
    return false;
  }

  // 2. Canonicalize manifest with RFC 8785 (JCS) and compute SHA-256
  const canonicalManifest = canonicalize(manifest);
  if (!canonicalManifest) {
    console.error("[FAIL] Failed to canonicalize manifest with RFC 8785.");
    return false;
  }
  const computedManifestSha256 = computeSha256(Buffer.from(canonicalManifest, "utf8"));
  console.log(`[PASS] manifestSha256 (RFC 8785 JCS): ${computedManifestSha256}`);

  // 3. Check proof.json if present
  const proofFile = zip.file("proof.json");
  if (proofFile) {
    try {
      const proofText = await proofFile.async("text");
      const proof = JSON.parse(proofText);
      if (proof.manifestSha256 === computedManifestSha256) {
        console.log(`[PASS] proof.json manifestSha256 matches JCS manifest hash: ${proof.manifestSha256}`);
      } else {
        console.error(`[FAIL] proof.json manifestSha256 mismatch: expected ${proof.manifestSha256}, got ${computedManifestSha256}`);
        allPassed = false;
      }
    } catch (err) {
      console.error("[FAIL] proof.json could not be parsed:", err);
      allPassed = false;
    }
  } else {
    console.log(`[INFO] proof.json not present in bundle (capture not yet anchored)`);
  }

  // 4. Check VERIFY.md
  const verifyMd = zip.file("VERIFY.md");
  if (verifyMd) {
    console.log(`[PASS] VERIFY.md instructions present`);
  } else {
    console.warn(`[WARN] VERIFY.md missing from bundle`);
  }

  // 5. Check AI analysis separation (must NOT be in manifest.artifacts)
  const aiFile = zip.file("ai_analysis.json");
  if (aiFile) {
    console.log(`[PASS] ai_analysis.json included as secondary artifact`);
    const inManifest = (manifest.artifacts || []).some((a: any) => a.id === "ai_analysis" || a.kind === "ai_analysis");
    if (inManifest) {
      console.error(`[FAIL] ai_analysis MUST NOT appear in anchored manifest.artifacts (PRD FR-9.3)`);
      allPassed = false;
    } else {
      console.log(`[PASS] ai_analysis correctly excluded from anchored manifest.artifacts`);
    }
  }

  // 6. Check each artifact against manifest.artifacts
  const manifestArtifacts: any[] = manifest.artifacts || [];
  console.log(`\nVerifying ${manifestArtifacts.length} artifact(s) against manifest SHA-256 hashes...`);

  // Collect all files in artifacts/
  const artifactFiles = zip.folder("artifacts");
  if (!artifactFiles) {
    console.error("[FAIL] artifacts/ folder missing from bundle archive.");
    return false;
  }

  for (const art of manifestArtifacts) {
    // Find file in zip artifacts/ directory
    let matchingFile = zip.file(`artifacts/${art.id}_${art.kind}`);
    if (!matchingFile) {
      // Try searching for file starting with `${art.id}_`
      const matches = zip.file(new RegExp(`^artifacts/${art.id}[_.]`));
      if (matches.length > 0) {
        matchingFile = matches[0];
      }
    }

    if (!matchingFile) {
      console.error(`[FAIL] Artifact file missing for id: ${art.id} (${art.kind})`);
      allPassed = false;
      continue;
    }

    const fileBuffer = await matchingFile.async("nodebuffer");
    const actualSha256 = computeSha256(fileBuffer);

    if (actualSha256 === art.sha256) {
      console.log(`[PASS] ${matchingFile.name}: ${actualSha256} (${fileBuffer.length} bytes)`);
    } else {
      console.error(`[FAIL] ${matchingFile.name} SHA-256 MISMATCH:`);
      console.error(`       Expected (manifest): ${art.sha256}`);
      console.error(`       Actual (decrypted):  ${actualSha256}`);
      allPassed = false;
    }
  }

  console.log(`\n========================================`);
  if (allPassed) {
    console.log(`OVERALL RESULT: PASS (All bundle files match manifest hashes)`);
    console.log(`========================================\n`);
    return true;
  } else {
    console.error(`OVERALL RESULT: FAIL (One or more files failed verification)`);
    console.log(`========================================\n`);
    return false;
  }
}

const targetPath = process.argv[2];
checkBundle(targetPath)
  .then((ok) => {
    process.exit(ok ? 0 : 1);
  })
  .catch((err) => {
    console.error("Check bundle execution error:", err);
    process.exit(1);
  });
